using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Search;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>
/// #890 (AC 3.25.15, 3.25.19 and 3.25.20) on real PostgreSQL, because global search and study-guide similarity are raw SQL (full-text search
/// and pg_trgm): a public item whose uploaded picture is PendingReview or Rejected is hidden from other people until it is Approved.
/// Requires Docker; CI runs it.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class PictureEligibilityPostgresHttpTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private static readonly string[] AdminGroups = ["Admins"];

    private static readonly TaxonomyRegistry Registry = new(
        new TestHostEnvironment(),
        Options.Create(new TaxonomyOptions()),
        NullLogger<TaxonomyRegistry>.Instance);

    private void RequireDatabase() => Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

    private static string Word() => "zq" + new string(Guid.NewGuid().ToByteArray().Take(8).Select(b => (char)('a' + (b % 26))).ToArray());

    private async Task<JwtHttpTestHost> StartSearchAsync() => await JwtHttpTestHost.StartAsync(
        () => fixture.CreateDbContext(),
        services =>
        {
            services.AddMemoryCache();
            services.AddSingleton<ITaxonomySearchIndex>(_ => new TaxonomySearchIndex(Registry));
            services.AddSingleton<TaxonomySearchCounts>();
        },
        app => new GlobalSearch.Endpoint().MapEndpoint(app),
        useUserUpsertMiddleware: true);

    private async Task<(string Token, Guid UserId)> SeedUserAsync(JwtHttpTestHost host, IReadOnlyCollection<string>? groups = null)
    {
        string subject = Guid.NewGuid().ToString();
        string email = $"{subject}@example.test";
        User user = new() { Id = Guid.NewGuid(), Subject = subject, Email = email, Name = subject };
        await using ApplicationDbContext db = fixture.CreateDbContext();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return (host.CreateToken(subject, email, groups, emailVerified: true), user.Id);
    }

    private static async Task<JsonElement> SearchAsync(JwtHttpTestHost host, string word, string? token)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, $"/search?q={word}%20&limit=20", token);
        using HttpResponseMessage response = await host.Client.SendAsync(request);
        string body = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(HttpStatusCode.OK, body);
        return JsonDocument.Parse(body).RootElement.GetProperty("groups").Clone();
    }

    private static List<string> ItemIds(JsonElement groups) =>
        groups.GetProperty("items").GetProperty("results").EnumerateArray().Select(e => e.GetProperty("id").GetString()!).ToList();

    private static int CollectionCount(JsonElement groups) =>
        groups.GetProperty("collections").GetProperty("results").EnumerateArray().Single().GetProperty("itemCount").GetInt32();

    private async Task ApproveAsync(Guid itemId)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Item item = await db.Items.SingleAsync(i => i.Id == itemId);
        item.ImageReviewState = ItemImageReviewState.Approved;
        await db.SaveChangesAsync();
    }

    [SkippableTheory]
    [InlineData(ItemImageReviewState.PendingReview)]
    [InlineData(ItemImageReviewState.Rejected)]
    public async Task GlobalSearch_HidesAnUnapprovedPictureItemAndItsCount_FromAnonymousAndUnrelatedCallers_UntilApproved(ItemImageReviewState state)
    {
        RequireDatabase();
        string word = Word();
        await using JwtHttpTestHost host = await StartSearchAsync();
        (_, Guid ownerId) = await SeedUserAsync(host);
        (string otherToken, _) = await SeedUserAsync(host);
        string owner = ownerId.ToString();

        Item hidden;
        Item plain;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            hidden = PictureSeed.AddPictureItem(db, category, owner, false, state, PictureSeed.AddAsset(db, owner));
            plain = VisibilitySeed.AddItem(db, category, owner, false);
            hidden.Question = $"{word} picture";
            plain.Question = $"{word} plain";
            Collection collection = new() { Id = Guid.NewGuid(), Name = $"{word} shelf", CreatedBy = owner, IsPublic = true, IsDiscoverable = true };
            db.Collections.Add(collection);
            VisibilitySeed.Link(db, collection, hidden);
            VisibilitySeed.Link(db, collection, plain);
            await db.SaveChangesAsync();
        }

        foreach (string? token in new[] { null, otherToken })
        {
            JsonElement groups = await SearchAsync(host, word, token);
            ItemIds(groups).Should().Equal(plain.Id.ToString());
            CollectionCount(groups).Should().Be(1, "the unapproved picture item is not counted");
        }

        await ApproveAsync(hidden.Id);

        foreach (string? token in new[] { null, otherToken })
        {
            JsonElement groups = await SearchAsync(host, word, token);
            ItemIds(groups).Should().BeEquivalentTo([plain.Id.ToString(), hidden.Id.ToString()]);
            CollectionCount(groups).Should().Be(2);
        }
    }

    [SkippableFact]
    public async Task GlobalSearch_IsPublicOnly_SoAnAdminsOwnPendingPublicPictureItemIsAbsentForThatAdmin()
    {
        RequireDatabase();
        string word = Word();
        await using JwtHttpTestHost host = await StartSearchAsync();
        (string adminToken, Guid adminId) = await SeedUserAsync(host, AdminGroups);
        string admin = adminId.ToString();

        Item pending;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            pending = PictureSeed.AddPictureItem(db, category, admin, false, ItemImageReviewState.PendingReview, PictureSeed.AddAsset(db, admin));
            pending.Question = $"{word} admin picture";
            await db.SaveChangesAsync();
        }

        JsonElement groups = await SearchAsync(host, word, adminToken);

        ItemIds(groups).Should().NotContain(pending.Id.ToString(), "documented current behaviour: search lists public eligible items only, even for their creator");
        JsonElement mine = groups.GetProperty("mine");
        List<string?> mineIds = mine.ValueKind == JsonValueKind.Object
            ? mine.GetProperty("results").EnumerateArray().Select(e => e.GetProperty("id").GetString()).ToList()
            : [];
        mineIds.Should().NotContain(pending.Id.ToString(), "Mine lists the caller's private items only");
    }

    [SkippableTheory]
    [InlineData(ItemImageReviewState.PendingReview)]
    [InlineData(ItemImageReviewState.Rejected)]
    public async Task StudyGuideSimilarity_NeverMatchesAnotherUsersUnapprovedPictureItem_UntilApproved(ItemImageReviewState state)
    {
        RequireDatabase();
        DateTime now = DateTime.UtcNow;
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            () => fixture.CreateDbContext(),
            services => services.AddScoped<IValidator<CheckStudyGuideSimilarity.Request>, CheckStudyGuideSimilarity.Validator>(),
            app => new CheckStudyGuideSimilarity.Endpoint().MapEndpoint(app),
            useUserUpsertMiddleware: true);
        (string token, Guid callerId) = await SeedUserAsync(host);
        (string otherToken, Guid otherId) = await SeedUserAsync(host);
        string userId = callerId.ToString();
        string otherUser = otherId.ToString();
        string categoryName = $"cat-{Guid.NewGuid():N}";
        string question = $"Which flag shows a red maple leaf on white {Guid.NewGuid():N}?";
        Guid documentId = Guid.NewGuid();
        Guid generationId = Guid.NewGuid();
        Guid candidateId = Guid.NewGuid();
        string hash = Guid.NewGuid().ToString("N");
        Item hidden;

        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = new() { Id = Guid.NewGuid(), Name = categoryName, IsPrivate = false, CreatedBy = "seed", CreatedAt = now };
            db.Categories.Add(category);
            hidden = PictureSeed.AddPictureItem(db, category, otherUser, false, state, PictureSeed.AddAsset(db, otherUser));
            hidden.Question = question;
            hidden.CorrectAnswer = "Canada";
            db.SectionGenerations.Add(new SectionGeneration
            {
                Id = generationId, TextSha256 = hash, Status = SectionGenerationStatus.Completed, NotBeforeUtc = now, CreatedUtc = now, QueuedUtc = now, CompletedUtc = now
            });
            db.GenerationCandidates.Add(new GenerationCandidate
            {
                Id = candidateId,
                GenerationId = generationId,
                Index = 0,
                Question = question,
                CorrectAnswer = "Canada",
                IncorrectAnswersJson = "[\"Peru\",\"Japan\"]",
                Explanation = "Because the guide says so.",
                SourceQuote = "quote",
                Page = 1
            });
            db.StudyGuideDocuments.Add(new StudyGuideDocument
            {
                Id = documentId,
                UserId = userId,
                Title = "Flags notes",
                FileType = "txt",
                FileSha256 = hash,
                TextSha256 = hash,
                CategoryName = categoryName,
                CreatedUtc = now,
                LastActivityUtc = now,
                ExpiresUtc = now.AddDays(30),
                Sections =
                [
                    new StudyGuideSection { Id = Guid.NewGuid(), Index = 0, Label = "Section 1", TextSha256 = hash, SizeBytes = 100, GenerationId = generationId }
                ]
            });
            await db.SaveChangesAsync();
        }

        async Task<(HttpStatusCode Status, JsonElement Body)> CheckAsync(string callerToken)
        {
            using HttpRequestMessage request = JwtHttpTestHost.Request(
                HttpMethod.Post,
                $"/study-guides/documents/{documentId}/similar-check",
                callerToken,
                JsonContent.Create(new { candidateIds = new[] { candidateId } }));
            using HttpResponseMessage response = await host.Client.SendAsync(request);
            string body = await response.Content.ReadAsStringAsync();
            return (response.StatusCode, body.Length == 0 ? default : JsonDocument.Parse(body).RootElement.Clone());
        }

        static List<JsonElement> Flags(JsonElement body) => body.GetProperty("flags").EnumerateArray().ToList();

        (HttpStatusCode status, JsonElement body) = await CheckAsync(token);
        status.Should().Be(HttpStatusCode.OK);
        Flags(body).Should().BeEmpty("another user's unapproved picture item is not visible to the caller");
        (await CheckAsync(otherToken)).Status.Should().Be(HttpStatusCode.NotFound, "the document belongs to the caller only");

        await ApproveAsync(hidden.Id);

        (status, body) = await CheckAsync(token);
        status.Should().Be(HttpStatusCode.OK);
        Flags(body).Should().ContainSingle().Which.GetProperty("similarTo").GetProperty("itemId").GetString().Should().Be(hidden.Id.ToString());
    }
}
