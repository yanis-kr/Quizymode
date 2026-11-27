using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Quotas;

/// <summary>AC 17.6 (#904) on real PostgreSQL: concurrent creates at limit-1 store exactly one row. Requires Docker.</summary>
[Trait("Category", "Postgres")]
public sealed class CreationQuotaPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private const int Concurrent = 8;

    private static readonly QuotaSettings Limits = new() { ItemsPerDay = 2, CollectionsPerDay = 2, CommentsPerDay = 2 };

    private readonly TaxonomyRegistry _taxonomy = new(new TestHostEnvironment(), Options.Create(new TaxonomyOptions()), NullLogger<TaxonomyRegistry>.Instance);

    private static IUserContext Member(string userId) =>
        Mock.Of<IUserContext>(user => user.UserId == userId && user.IsAuthenticated);

    [SkippableFact]
    public async Task ConcurrentCollectionCreates_AtLimitMinusOne_StoreExactlyOne()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        await using (ApplicationDbContext seed = fixture.CreateDbContext())
        {
            seed.Collections.Add(new Collection { Id = Guid.NewGuid(), Name = "Existing", CreatedBy = userId, CreatedAt = DateTime.UtcNow });
            await seed.SaveChangesAsync();
        }

        List<Result<AddCollection.Response>> results = await RunConcurrentlyAsync(async (db, i) =>
            await AddCollection.HandleAsync(
                new AddCollection.Request($"New {i}"), db, Member(userId), NullLogger<AddCollection.Endpoint>.Instance,
                CancellationToken.None, Limits));

        results.Count(r => r.IsSuccess).Should().Be(1);
        results.Where(r => r.IsFailure).Should().OnlyContain(r => r.Error.Code == "Quota.CollectionsPerDay");
        await using ApplicationDbContext verify = fixture.CreateDbContext();
        (await verify.Collections.CountAsync(c => c.CreatedBy == userId)).Should().Be(2);
    }

    [SkippableFact]
    public async Task ConcurrentCommentCreates_AtLimitMinusOne_StoreExactlyOne()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        Guid categoryId = await EnsureGeographyAsync();
        Guid itemId = Guid.NewGuid();
        await using (ApplicationDbContext seed = fixture.CreateDbContext())
        {
            seed.Items.Add(new Item
            {
                Id = itemId, Question = "Commented question?", CorrectAnswer = "Yes", IncorrectAnswers = ["No"], Explanation = "",
                FuzzySignature = "0000000000000000", CreatedBy = "seeder", CreatedAt = DateTime.UtcNow, IsPrivate = false,
                CategoryId = categoryId
            });
            seed.Comments.Add(new Comment { Id = Guid.NewGuid(), ItemId = itemId, Text = "Existing", CreatedBy = userId, CreatedAt = DateTime.UtcNow });
            await seed.SaveChangesAsync();
        }

        List<Result<AddComment.Response>> results = await RunConcurrentlyAsync(async (db, i) =>
            await AddComment.HandleAsync(
                new AddComment.Request(itemId, $"New {i}"), db, Member(userId), Mock.Of<IAuditService>(), CancellationToken.None, Limits));

        results.Count(r => r.IsSuccess).Should().Be(1);
        results.Where(r => r.IsFailure).Should().OnlyContain(r => r.Error.Code == "Quota.CommentsPerDay");
        await using ApplicationDbContext verify = fixture.CreateDbContext();
        (await verify.Comments.CountAsync(c => c.CreatedBy == userId)).Should().Be(2);
    }

    [SkippableFact]
    public async Task ConcurrentItemCreates_AtLimitMinusOne_StoreExactlyOne()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        await EnsureGeographyAsync();
        string[] topics = ["rivers", "mountains", "volcanoes", "deserts", "glaciers", "islands", "lakes", "forests", "oceans"];

        async Task<Result<AddItem.Response>> AddAsync(ApplicationDbContext db, int i) =>
            await AddItemHandler.HandleAsync(
                new AddItem.Request("geography", "capitals", "europe", true, $"Tell me one fact about {topics[i]} in {Guid.NewGuid():N}?", "Fact", ["Fiction"], ""),
                db, new SimHashService(), Member(userId), Mock.Of<IAuditService>(),
                new TaxonomyItemCategoryResolver(db, _taxonomy), _taxonomy, CancellationToken.None, Limits);

        await using (ApplicationDbContext seed = fixture.CreateDbContext())
        {
            Result<AddItem.Response> existing = await AddAsync(seed, Concurrent);
            existing.IsSuccess.Should().BeTrue(existing.IsFailure ? existing.Error.Description : null);
        }

        List<Result<AddItem.Response>> results = await RunConcurrentlyAsync(AddAsync);

        results.Count(r => r.IsSuccess).Should().Be(1);
        results.Where(r => r.IsFailure).Should().OnlyContain(r => r.Error.Code == "Quota.ItemsPerDay");
        await using ApplicationDbContext verify = fixture.CreateDbContext();
        (await verify.Items.CountAsync(item => item.CreatedBy == userId)).Should().Be(2);
    }

    private async Task<List<T>> RunConcurrentlyAsync<T>(Func<ApplicationDbContext, int, Task<T>> create)
    {
        IEnumerable<Task<T>> tasks = Enumerable.Range(0, Concurrent).Select(i => Task.Run(async () =>
        {
            await using ApplicationDbContext db = fixture.CreateDbContext();
            return await create(db, i);
        }));
        return (await Task.WhenAll(tasks)).ToList();
    }

    private async Task<Guid> EnsureGeographyAsync()
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category? existing = await db.Categories.FirstOrDefaultAsync(c => c.Name == "geography");
        if (existing is not null)
        {
            return existing.Id;
        }

        DateTime now = DateTime.UtcNow;
        Category category = new() { Id = Guid.NewGuid(), Name = "geography", IsPrivate = false, CreatedBy = "seeder", CreatedAt = now };
        Keyword capitals = new() { Id = Guid.NewGuid(), Name = "capitals", IsPrivate = false, CreatedBy = "seeder", CreatedAt = now };
        Keyword europe = new() { Id = Guid.NewGuid(), Name = "europe", IsPrivate = false, CreatedBy = "seeder", CreatedAt = now };
        db.Categories.Add(category);
        db.Keywords.AddRange(capitals, europe);
        db.KeywordRelations.AddRange(
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = capitals.Id, SortOrder = 0, CreatedAt = now },
            new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = capitals.Id, ChildKeywordId = europe.Id, SortOrder = 0, CreatedAt = now });
        await db.SaveChangesAsync();
        return category.Id;
    }
}
