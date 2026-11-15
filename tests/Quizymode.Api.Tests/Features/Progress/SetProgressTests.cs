using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Progress;
using Quizymode.Api.Features.StudySessions;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.Features.LearningLoop;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using Queue = Quizymode.Api.Features.ReviewQueue.ReviewQueue;

namespace Quizymode.Api.Tests.Features.Progress;

/// <summary>#685 (ACs B1-B5): signed-in per-set progress over real HTTP with real JWT validation.</summary>
public sealed class SetProgressTests : DatabaseTestFixture, IAsyncLifetime
{
    private readonly SqlCaptureInterceptor _sql;
    private JwtHttpTestHost _host = null!;

    public SetProgressTests() : this(new SqlCaptureInterceptor())
    {
    }

    private SetProgressTests(SqlCaptureInterceptor sql) : base([sql])
    {
        _sql = sql;
    }

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => services.AddScoped<IValidator<RecordStudySession.Request>, RecordStudySession.Validator>(),
            app =>
            {
                new RecordStudySession.Endpoint().MapEndpoint(app);
                new GetSetProgress.Endpoint().MapEndpoint(app);
                new Queue.Endpoint().MapEndpoint(app);
            });
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string Token(string subject = "member") => _host.CreateToken(subject, $"{subject}@example.com");

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, string? token, object? body = null)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, url, token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await _host.Client.SendAsync(request);
    }

    private async Task<string> UserIdAsync(string subject)
    {
        (await SendAsync(HttpMethod.Get, "/users/me/set-progress?scopes=s/none", Token(subject))).StatusCode.Should().Be(HttpStatusCode.OK);
        return (await DbContext.Users.SingleAsync(u => u.Subject == subject)).Id.ToString();
    }

    private async Task<int> KnownAsync(string scope, string subject = "member")
    {
        using HttpResponseMessage response = await SendAsync(HttpMethod.Get, $"/users/me/set-progress?scopes={scope}", Token(subject));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        GetSetProgress.Response? body = await response.Content.ReadFromJsonAsync<GetSetProgress.Response>();
        return body!.Scopes.Single().KnownCount;
    }

    private async Task<HttpStatusCode> PostSessionAsync(
        string runId, IReadOnlyList<Guid> correct, IReadOnlyList<Guid> missed, int? correctCount = null, int? total = null, string subject = "member")
    {
        using HttpResponseMessage response = await SendAsync(HttpMethod.Post, "/study-sessions", Token(subject), new
        {
            runId,
            completedAt = DateTime.UtcNow.AddMinutes(-1),
            correct = correctCount ?? correct.Count,
            total = total ?? (correct.Count + missed.Count),
            source = new { kind = "category", categorySlug = "geo", navigationKeywords = Array.Empty<string>(), filterKeywords = Array.Empty<string>() },
            missedItemIds = missed,
            correctItemIds = correct,
        });
        return response.StatusCode;
    }

    private async Task<(Category Category, Item A, Item B, Item C)> SeedSetAsync()
    {
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "Geo");
        Item a = await LearningLoopTestData.AddItemAsync(DbContext, category);
        Item b = await LearningLoopTestData.AddItemAsync(DbContext, category);
        Item c = await LearningLoopTestData.AddItemAsync(DbContext, category);
        return (category, a, b, c);
    }

    [Fact]
    public async Task B1_CorrectAndMissed_CountKnown_AndSameRunRetryChangesNothing()
    {
        (_, Item a, Item b, Item c) = await SeedSetAsync();

        (await PostSessionAsync("run-1", [a.Id, b.Id], [c.Id])).Should().Be(HttpStatusCode.Created);
        (await KnownAsync("s/geo")).Should().Be(2);

        // Same runId retried with a different payload: created=false, progress untouched.
        (await PostSessionAsync("run-1", [c.Id], [a.Id, b.Id])).Should().Be(HttpStatusCode.OK);
        (await KnownAsync("s/geo")).Should().Be(2);
    }

    [Fact]
    public async Task B2_LaterWrongAnswer_MakesUnknown_ReviewCorrectSetsKnown_GuestImportWritesNothing()
    {
        (_, Item a, Item b, Item c) = await SeedSetAsync();
        string userId = await UserIdAsync("member");
        (await PostSessionAsync("run-1", [a.Id, b.Id], [c.Id])).Should().Be(HttpStatusCode.Created);

        // A later wrong answer on A.
        (await PostSessionAsync("run-2", [], [a.Id], correctCount: 0, total: 1)).Should().Be(HttpStatusCode.Created);
        (await KnownAsync("s/geo")).Should().Be(1);

        // A correct review-queue answer sets it known again (the miss queued A, make it due).
        ReviewQueueEntry entry = await DbContext.ReviewQueueEntries.SingleAsync(e => e.UserId == userId && e.ItemId == a.Id);
        entry.DueAt = DateTime.UtcNow.AddHours(-1);
        await DbContext.SaveChangesAsync();
        using (HttpResponseMessage answer = await SendAsync(HttpMethod.Post, $"/review-queue/{a.Id}/answers", Token(), new { isCorrect = true }))
        {
            answer.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        (await KnownAsync("s/geo")).Should().Be(2);

        // Guest import writes nothing, even with correct ids.
        RecordStudySession.Request import = new(
            "import-1", DateTime.UtcNow.AddMinutes(-1), 1, 2,
            new RecordStudySession.SourceDto("category", null, "geo", [], []),
            [a.Id], CorrectItemIds: [c.Id]);
        await using ApplicationDbContext db = CreateDbContext();
        await RecordStudySession.HandleAsync(import, StudySessionOrigins.GuestImport, db, userId, CancellationToken.None);
        (await KnownAsync("s/geo")).Should().Be(2);
        (await DbContext.UserItemProgress.AsNoTracking().CountAsync(p => p.UserId == userId)).Should().Be(3);
    }

    [Fact]
    public async Task LearnSession_WritesNoProgress()
    {
        (_, Item a, _, Item c) = await SeedSetAsync();
        string userId = await UserIdAsync("member");
        RecordStudySession.Request learn = new(
            "learn-1", DateTime.UtcNow.AddMinutes(-1), 1, 2,
            new RecordStudySession.SourceDto("category", null, "geo", [], []),
            [c.Id], Mode: "learn", CorrectItemIds: [a.Id]);
        await using ApplicationDbContext db = CreateDbContext();
        await RecordStudySession.HandleAsync(learn, StudySessionOrigins.Quiz, db, userId, CancellationToken.None);

        (await KnownAsync("s/geo")).Should().Be(0);
        (await DbContext.UserItemProgress.AsNoTracking().CountAsync(p => p.UserId == userId)).Should().Be(0);
    }

    [Fact]
    public async Task B3_Validation_And_Authorization()
    {
        (_, Item a, Item b, _) = await SeedSetAsync();
        string member = Token();

        string thirteen = string.Join(',', Enumerable.Range(0, 13).Select(i => $"s/cat{i}"));
        string twelve = string.Join(',', Enumerable.Range(0, 12).Select(i => $"s/cat{i}"));
        (await SendAsync(HttpMethod.Get, $"/users/me/set-progress?scopes={thirteen}", member)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await SendAsync(HttpMethod.Get, $"/users/me/set-progress?scopes={twelve}", member)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await SendAsync(HttpMethod.Get, "/users/me/set-progress?scopes=s/Bad Slug!", member)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await SendAsync(HttpMethod.Get, "/users/me/set-progress?scopes=x/geo", member)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await SendAsync(HttpMethod.Get, "/users/me/set-progress?scopes=c/not-a-guid", member)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await SendAsync(HttpMethod.Get, "/users/me/set-progress", member)).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // correctItemIds longer than correct, duplicated, or over 1000.
        (await PostSessionAsync("r-long", [a.Id, b.Id], [], correctCount: 1, total: 2)).Should().Be(HttpStatusCode.BadRequest);
        (await PostSessionAsync("r-dup", [a.Id, a.Id], [], correctCount: 2, total: 2)).Should().Be(HttpStatusCode.BadRequest);
        List<Guid> many = Enumerable.Range(0, 1001).Select(_ => Guid.NewGuid()).ToList();
        (await PostSessionAsync("r-many", many, [], correctCount: 1000, total: 1000)).Should().Be(HttpStatusCode.BadRequest);
        (await PostSessionAsync("r-overlap", [a.Id], [a.Id], correctCount: 1, total: 2)).Should().Be(HttpStatusCode.BadRequest);

        (await SendAsync(HttpMethod.Get, "/users/me/set-progress?scopes=s/geo", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        using HttpResponseMessage ok = await SendAsync(HttpMethod.Get, "/users/me/set-progress?scopes=s/geo", member);
        ok.Headers.CacheControl!.Private.Should().BeTrue();
        ok.Headers.CacheControl.NoStore.Should().BeTrue();
    }

    [Fact]
    public async Task B4_DeletedOrPrivateItems_StopCounting()
    {
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "Geo");
        Item a = await LearningLoopTestData.AddItemAsync(DbContext, category);
        Item b = await LearningLoopTestData.AddItemAsync(DbContext, category);
        Item c = await LearningLoopTestData.AddItemAsync(DbContext, category);
        (await PostSessionAsync("run-1", [a.Id, b.Id, c.Id], [])).Should().Be(HttpStatusCode.Created);
        (await KnownAsync("s/geo")).Should().Be(3);

        DbContext.Items.Remove(a);
        b.IsPrivate = true; // created by "seed", not by the caller
        await DbContext.SaveChangesAsync();

        (await KnownAsync("s/geo")).Should().Be(1);
    }

    [Fact]
    public async Task B5_SqlCommandCount_DoesNotDependOnKnownItemCount()
    {
        Category category = await LearningLoopTestData.AddCategoryAsync(DbContext, "Geo");
        List<Item> items = new();
        for (int i = 0; i < 600; i++)
        {
            items.Add(new Item
            {
                Id = Guid.NewGuid(), Question = $"Q{i}", CorrectAnswer = "R", IncorrectAnswers = ["x", "y"], Explanation = string.Empty,
                FuzzySignature = "0", CategoryId = category.Id, CreatedBy = "seed", CreatedAt = DateTime.UtcNow.AddDays(-1),
            });
        }
        DbContext.Items.AddRange(items);
        string few = await UserIdAsync("few");
        string lots = await UserIdAsync("lots");
        DbContext.UserItemProgress.AddRange(items.Take(3).Select(i => new UserItemProgress { UserId = few, ItemId = i.Id, IsKnown = true, UpdatedAt = DateTime.UtcNow }));
        DbContext.UserItemProgress.AddRange(items.Select(i => new UserItemProgress { UserId = lots, ItemId = i.Id, IsKnown = true, UpdatedAt = DateTime.UtcNow }));
        await DbContext.SaveChangesAsync();

        int before = _sql.Commands.Count;
        (await KnownAsync("s/geo", "few")).Should().Be(3);
        int fewCommands = _sql.Commands.Count - before;
        before = _sql.Commands.Count;
        (await KnownAsync("s/geo", "lots")).Should().Be(600);
        int lotsCommands = _sql.Commands.Count - before;

        lotsCommands.Should().Be(fewCommands);
        _sql.Commands.Should().NotContain(c => c.Contains(" IN (@"), "progress is read with a subquery, never an id list");
    }
}
