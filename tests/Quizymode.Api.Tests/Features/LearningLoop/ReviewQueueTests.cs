using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.StudySessions;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using Queue = Quizymode.Api.Features.ReviewQueue.ReviewQueue;

namespace Quizymode.Api.Tests.Features.LearningLoop;

public sealed class ReviewQueueTests : DatabaseTestFixture
{
    private const string UserId = "user-a";

    private async Task RecordRunAsync(string origin, params Guid[] missed)
    {
        RecordStudySession.Request request = new(
            $"run-{Guid.NewGuid():N}",
            DateTime.UtcNow.AddMinutes(-1),
            10 - missed.Length,
            10,
            null,
            missed.ToList());
        var result = await RecordStudySession.HandleAsync(request, origin, DbContext, UserId, CancellationToken.None);
        result.IsSuccess.Should().BeTrue();
    }

    private async Task<Item> NewItemAsync(bool isPrivate = false, string createdBy = "seed")
    {
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, $"cat{Guid.NewGuid():N}"[..10]);
        return await LearningLoopTestData.AddItemAsync(DbContext, category, isPrivate, createdBy);
    }

    private ReviewQueueEntry Entry(Guid itemId) =>
        DbContext.ReviewQueueEntries.AsNoTracking().Single(e => e.UserId == UserId && e.ItemId == itemId);

    [Fact]
    public async Task LiveQuizMiss_IsQueuedAtFirstInterval_DueNextDay()
    {
        Item item = await NewItemAsync();

        await RecordRunAsync(StudySessionOrigins.Quiz, item.Id);

        ReviewQueueEntry entry = Entry(item.Id);
        entry.IntervalIndex.Should().Be(0);
        entry.DueAt.Should().BeCloseTo(DateTime.UtcNow.AddDays(1), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task GuestImportMiss_IsNotQueued_AndUnknownItemsAreSkipped()
    {
        Item item = await NewItemAsync();

        await RecordRunAsync(StudySessionOrigins.GuestImport, item.Id);
        await RecordRunAsync(StudySessionOrigins.Quiz, Guid.NewGuid());

        DbContext.ReviewQueueEntries.Count().Should().Be(0);
    }

    [Fact]
    public async Task RepeatedMiss_ResetsAnAdvancedEntryToFirstInterval()
    {
        Item item = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = item.Id, IntervalIndex = 3, DueAt = DateTime.UtcNow.AddDays(10), ItemVersionAt = item.CreatedAt,
        });
        await DbContext.SaveChangesAsync();

        await RecordRunAsync(StudySessionOrigins.Quiz, item.Id);

        Entry(item.Id).IntervalIndex.Should().Be(0);
    }

    [Fact]
    public async Task Queue_ReturnsOnlyDueItems_OldestFirst_CappedAt20()
    {
        DateTime now = DateTime.UtcNow;
        List<Item> items = new();
        for (int i = 0; i < 23; i++)
        {
            Item item = await NewItemAsync();
            items.Add(item);
            DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
            {
                UserId = UserId, ItemId = item.Id, DueAt = now.AddHours(-30 + i), ItemVersionAt = item.CreatedAt,
            });
        }
        Item notDue = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = notDue.Id, DueAt = now.AddDays(2), ItemVersionAt = notDue.CreatedAt,
        });
        await DbContext.SaveChangesAsync();

        Queue.QueueResponse response = await Queue.GetQueueAsync(DbContext, LearningLoopTestData.User(UserId), now, CancellationToken.None);

        response.Items.Should().HaveCount(Queue.MaxItemsPerSession);
        response.Items.Select(i => i.Id).Should().Equal(items.Take(20).Select(i => i.Id.ToString()));
        response.DueCount.Should().Be(23);
        response.TotalCount.Should().Be(24);
        response.NextDueAt.Should().BeCloseTo(now.AddDays(2), TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Queue_DropsDeletedAndOthersPrivateItems_KeepsMyPrivateItem()
    {
        DateTime now = DateTime.UtcNow;
        Item othersPrivate = await NewItemAsync(isPrivate: true, createdBy: "someone-else");
        Item minePrivate = await NewItemAsync(isPrivate: true, createdBy: UserId);
        Guid deleted = Guid.NewGuid();
        foreach (Guid id in new[] { othersPrivate.Id, minePrivate.Id, deleted })
        {
            DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry { UserId = UserId, ItemId = id, DueAt = now.AddHours(-1), ItemVersionAt = now.AddDays(-5) });
        }
        await DbContext.SaveChangesAsync();

        Queue.QueueResponse response = await Queue.GetQueueAsync(DbContext, LearningLoopTestData.User(UserId), now, CancellationToken.None);

        response.Items.Select(i => i.Id).Should().Equal(minePrivate.Id.ToString());
        DbContext.ReviewQueueEntries.AsNoTracking().Select(e => e.ItemId).Should().Equal(minePrivate.Id);
    }

    [Fact]
    public async Task Queue_NeverServesOrCountsUnplayableItems()
    {
        DateTime now = DateTime.UtcNow;
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "trivia");
        Item playable = await LearningLoopTestData.AddItemAsync(DbContext, category);
        Item blankOnly = await LearningLoopTestData.AddItemAsync(DbContext, category, incorrect: new List<string> { " " });
        Item none = await LearningLoopTestData.AddItemAsync(DbContext, category, incorrect: new List<string>());
        foreach (Item item in new[] { blankOnly, none, playable })
        {
            DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry { UserId = UserId, ItemId = item.Id, DueAt = now.AddHours(-1), ItemVersionAt = item.CreatedAt });
        }
        await DbContext.SaveChangesAsync();

        Queue.SummaryResponse summary = await Queue.GetSummaryAsync(DbContext, UserId, now, CancellationToken.None);
        summary.DueCount.Should().Be(1);
        summary.TotalCount.Should().Be(1);

        Queue.QueueResponse response = await Queue.GetQueueAsync(DbContext, LearningLoopTestData.User(UserId), now, CancellationToken.None);

        response.Items.Select(i => i.Id).Should().Equal(playable.Id.ToString());
        response.DueCount.Should().Be(1);
        response.TotalCount.Should().Be(1);
    }

    [Fact]
    public async Task Queue_ItemChangedAfterQueued_RestartsAsFreshMiss()
    {
        DateTime now = DateTime.UtcNow;
        Item item = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = item.Id, IntervalIndex = 2, DueAt = now.AddDays(5), ItemVersionAt = item.CreatedAt,
        });
        Item tracked = await DbContext.Items.SingleAsync(i => i.Id == item.Id);
        tracked.UpdatedAt = now.AddMinutes(-5);
        await DbContext.SaveChangesAsync();

        await Queue.GetQueueAsync(DbContext, LearningLoopTestData.User(UserId), now, CancellationToken.None);

        ReviewQueueEntry entry = Entry(item.Id);
        entry.IntervalIndex.Should().Be(0);
        entry.DueAt.Should().BeCloseTo(now.AddDays(1), TimeSpan.FromSeconds(1));
        entry.ItemVersionAt.Should().BeCloseTo(now.AddMinutes(-5), TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Queue_ChangedItemThatWasDue_IsNotServedAsDue()
    {
        DateTime now = DateTime.UtcNow;
        Item item = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = item.Id, IntervalIndex = 2, DueAt = now.AddHours(-2), ItemVersionAt = item.CreatedAt,
        });
        Item tracked = await DbContext.Items.SingleAsync(i => i.Id == item.Id);
        tracked.UpdatedAt = now.AddMinutes(-5);
        await DbContext.SaveChangesAsync();

        Queue.QueueResponse response = await Queue.GetQueueAsync(DbContext, LearningLoopTestData.User(UserId), now, CancellationToken.None);

        response.Items.Should().BeEmpty("a changed item restarts as a fresh miss due tomorrow");
        response.DueCount.Should().Be(0);
        Entry(item.Id).DueAt.Should().BeCloseTo(now.AddDays(1), TimeSpan.FromSeconds(1));
    }

    [Theory]
    [InlineData(0, true, 1, 3)]
    [InlineData(1, true, 2, 7)]
    [InlineData(3, true, 4, 30)]
    [InlineData(3, false, 0, 1)]
    public async Task Answer_AdvancesOrResetsInterval(int startIndex, bool isCorrect, int expectedIndex, int expectedDays)
    {
        DateTime now = DateTime.UtcNow;
        Item item = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = item.Id, IntervalIndex = startIndex, DueAt = now.AddMinutes(-1), ItemVersionAt = item.CreatedAt,
        });
        await DbContext.SaveChangesAsync();

        Queue.AnswerResponse? response = await Queue.AnswerAsync(DbContext, UserId, item.Id, isCorrect, now, CancellationToken.None);

        response!.Applied.Should().BeTrue();
        response.IntervalDays.Should().Be(expectedDays);
        Entry(item.Id).IntervalIndex.Should().Be(expectedIndex);
        Entry(item.Id).DueAt.Should().BeCloseTo(now.AddDays(expectedDays), TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Answer_CorrectAtLastInterval_Graduates()
    {
        DateTime now = DateTime.UtcNow;
        Item item = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = item.Id, IntervalIndex = 4, DueAt = now.AddMinutes(-1), ItemVersionAt = item.CreatedAt,
        });
        await DbContext.SaveChangesAsync();

        Queue.AnswerResponse? response = await Queue.AnswerAsync(DbContext, UserId, item.Id, true, now, CancellationToken.None);

        response!.Graduated.Should().BeTrue();
        DbContext.ReviewQueueEntries.Count().Should().Be(0);
    }

    [Fact]
    public async Task Answer_NotDue_IsNotApplied_AndUnknownReturnsNull()
    {
        DateTime now = DateTime.UtcNow;
        Item item = await NewItemAsync();
        DbContext.ReviewQueueEntries.Add(new ReviewQueueEntry
        {
            UserId = UserId, ItemId = item.Id, IntervalIndex = 1, DueAt = now.AddDays(2), ItemVersionAt = item.CreatedAt,
        });
        await DbContext.SaveChangesAsync();

        Queue.AnswerResponse? repeated = await Queue.AnswerAsync(DbContext, UserId, item.Id, false, now, CancellationToken.None);
        Queue.AnswerResponse? otherUser = await Queue.AnswerAsync(DbContext, "user-b", item.Id, true, now, CancellationToken.None);

        repeated!.Applied.Should().BeFalse();
        Entry(item.Id).IntervalIndex.Should().Be(1);
        otherUser.Should().BeNull();
    }
}
