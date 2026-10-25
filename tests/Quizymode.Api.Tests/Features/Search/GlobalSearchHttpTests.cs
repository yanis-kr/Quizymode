using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Search;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Search;

/// <summary>
/// #320: GET /search over real HTTP with the production JWT bearer pipeline, the real UserUpsertMiddleware and
/// PostgreSQL, so status codes, cross-user isolation and the rate limiter are observed end to end. Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class GlobalSearchHttpTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private static readonly TaxonomyRegistry Registry = new(
        new TestHostEnvironment(),
        Options.Create(new TaxonomyOptions()),
        NullLogger<TaxonomyRegistry>.Instance);

    private void RequireDatabase() => Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

    private static string Word()
    {
        string letters = new(Guid.NewGuid().ToByteArray().Take(8).Select(b => (char)('a' + (b % 26))).ToArray());
        return "zq" + letters;
    }

    private async Task<JwtHttpTestHost> StartAsync(bool rateLimiting = false)
    {
        RequireDatabase();
        return await JwtHttpTestHost.StartAsync(
            () => fixture.CreateDbContext(),
            services =>
            {
                services.AddMemoryCache();
                services.AddSingleton<ITaxonomySearchIndex>(_ => new TaxonomySearchIndex(Registry));
                services.AddSingleton<TaxonomySearchCounts>();
            },
            app => new GlobalSearch.Endpoint().MapEndpoint(app),
            useUserUpsertMiddleware: true,
            useRateLimiting: rateLimiting);
    }

    private async Task<(string Token, Guid UserId)> SeedUserAsync(JwtHttpTestHost host)
    {
        string subject = Guid.NewGuid().ToString();
        string email = $"{subject}@example.test";
        User user = new() { Id = Guid.NewGuid(), Subject = subject, Email = email, Name = subject };
        await using ApplicationDbContext db = fixture.CreateDbContext();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return (host.CreateToken(subject, email, emailVerified: true), user.Id);
    }

    private static async Task<JsonElement> GetJsonAsync(JwtHttpTestHost host, string url, string? token, HttpStatusCode expected = HttpStatusCode.OK)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, url, token);
        using HttpResponseMessage response = await host.Client.SendAsync(request);
        response.StatusCode.Should().Be(expected);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static List<string> Ids(JsonElement group) =>
        group.GetProperty("results").EnumerateArray().Select(e => e.GetProperty("id").GetString()!).ToList();

    private async Task SeedAsync(string word, Guid userA, Guid userB, Func<ApplicationDbContext, Task>? extra = null)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category category = VisibilitySeed.AddCategory(db);
        foreach ((Guid owner, bool isPrivate, string label) in new[] { (userA, true, "a-private"), (userA, false, "a-public"), (userB, true, "b-private"), (userB, false, "b-public") })
        {
            Item item = VisibilitySeed.AddItem(db, category, owner.ToString(), isPrivate);
            item.Question = $"{word} {label}";
        }

        db.Collections.AddRange(
            new Collection { Id = Guid.NewGuid(), Name = $"{word} a-collection", CreatedBy = userA.ToString(), IsPublic = false },
            new Collection { Id = Guid.NewGuid(), Name = $"{word} b-private-collection", CreatedBy = userB.ToString(), IsPublic = false },
            new Collection { Id = Guid.NewGuid(), Name = $"{word} b-public-collection", CreatedBy = userB.ToString(), IsPublic = true, IsDiscoverable = true });
        foreach ((Guid owner, string title, int days) in new[] { (userA, "a-live", 5), (userA, "a-expired", -2), (userB, "b-live", 5) })
        {
            db.StudyGuideDocuments.Add(new StudyGuideDocument
            {
                Id = Guid.NewGuid(),
                UserId = owner.ToString(),
                Title = $"{word} {title}",
                FileType = "txt",
                FileSha256 = Guid.NewGuid().ToString("N"),
                TextSha256 = Guid.NewGuid().ToString("N"),
                CategoryName = "tech",
                NavigationKeyword1 = "ai-ml",
                NavigationKeyword2 = "llms",
                CreatedUtc = DateTime.UtcNow,
                LastActivityUtc = DateTime.UtcNow,
                ExpiresUtc = DateTime.UtcNow.AddDays(days)
            });
        }

        if (extra is not null)
        {
            await extra(db);
        }

        await db.SaveChangesAsync();
    }

    private static List<string> Titles(JsonElement group) =>
        group.GetProperty("results").EnumerateArray().Select(e => e.GetProperty("title").GetString()!).ToList();

    [SkippableFact]
    public async Task Anonymous_GetsSuccessWithMineNull_EvenWhenMineIsRequested()
    {
        await using JwtHttpTestHost host = await StartAsync();
        string word = Word();
        Guid userA = Guid.NewGuid();
        Guid userB = Guid.NewGuid();
        await SeedAsync(word, userA, userB);

        JsonElement all = await GetJsonAsync(host, $"/search?q={word}%20", null);
        all.GetProperty("groups").GetProperty("mine").ValueKind.Should().Be(JsonValueKind.Null);
        Ids(all.GetProperty("groups").GetProperty("items")).Should().HaveCount(2, "only the two public items are discoverable");

        JsonElement mineOnly = await GetJsonAsync(host, $"/search?q={word}%20&types=mine", null);
        JsonElement groups = mineOnly.GetProperty("groups");
        foreach (string name in new[] { "categories", "subcategories", "collections", "items", "mine" })
        {
            groups.GetProperty(name).ValueKind.Should().Be(JsonValueKind.Null, name);
        }
    }

    [SkippableFact]
    public async Task UserA_NeverSeesUserBsPrivateContent_ButSeesTheirOwn()
    {
        await using JwtHttpTestHost host = await StartAsync();
        string word = Word();
        (string tokenA, Guid userA) = await SeedUserAsync(host);
        (string tokenB, Guid userB) = await SeedUserAsync(host);
        await SeedAsync(word, userA, userB);

        JsonElement groupsA = (await GetJsonAsync(host, $"/search?q={word}%20&limit=20", tokenA)).GetProperty("groups");

        List<string> mineTitles = Titles(groupsA.GetProperty("mine"));
        mineTitles.Should().BeEquivalentTo([$"{word} a-private", $"{word} a-collection", $"{word} a-live"]);
        mineTitles.Should().NotContain(title => title.Contains("b-", StringComparison.Ordinal) || title.Contains("expired", StringComparison.Ordinal));

        List<string> publicItemSnippets = groupsA.GetProperty("items").GetProperty("results").EnumerateArray()
            .Select(e => e.GetProperty("snippet").GetProperty("text").GetString()!).ToList();
        publicItemSnippets.Should().BeEquivalentTo([$"{word} a-public", $"{word} b-public"]);

        groupsA.GetProperty("collections").GetProperty("results").EnumerateArray()
            .Select(e => e.GetProperty("name").GetString()).Should().BeEquivalentTo([$"{word} b-public-collection"]);

        string rawA = groupsA.GetRawText();
        rawA.Should().NotContain("b-private").And.NotContain(userB.ToString()).And.NotContain("example.test");

        JsonElement groupsB = (await GetJsonAsync(host, $"/search?q={word}%20&limit=20", tokenB)).GetProperty("groups");
        Titles(groupsB.GetProperty("mine")).Should().BeEquivalentTo([$"{word} b-private", $"{word} b-private-collection", $"{word} b-public-collection", $"{word} b-live"]);
        groupsB.GetRawText().Should().NotContain("a-private").And.NotContain("a-collection").And.NotContain("a-live");
    }

    [SkippableTheory]
    [InlineData("/search")]
    [InlineData("/search?q=a")]
    [InlineData("/search?q=%20a%20")]
    [InlineData("/search?q=ab&types=bogus")]
    [InlineData("/search?q=ab&types=items,bogus")]
    [InlineData("/search?q=ab&limit=0")]
    [InlineData("/search?q=ab&limit=21")]
    [InlineData("/search?q=ab&offset=-1")]
    [InlineData("/search?q=ab&offset=201")]
    [InlineData("/search?q=ab&limit=abc")]
    public async Task InvalidRequests_Return400(string url)
    {
        await using JwtHttpTestHost host = await StartAsync();

        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, url);
        using HttpResponseMessage response = await host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [SkippableFact]
    public async Task QueryOver100Characters_Returns400_AndBoundariesPass()
    {
        await using JwtHttpTestHost host = await StartAsync();

        (await host.Client.GetAsync($"/search?q={new string('a', 101)}")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await host.Client.GetAsync($"/search?q={new string('a', 100)}&types=categories")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await host.Client.GetAsync("/search?q=ab&types=categories&limit=20&offset=200")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [SkippableFact]
    public async Task ArtificialIntelligence_ReturnsTechAiMlFirst_AndTheTypoToo()
    {
        await using JwtHttpTestHost host = await StartAsync();

        foreach (string q in new[] { "artificial%20intelligence", "artifical" })
        {
            JsonElement first = (await GetJsonAsync(host, $"/search?q={q}&types=subcategories", null))
                .GetProperty("groups").GetProperty("subcategories").GetProperty("results")[0];
            first.GetProperty("categorySlug").GetString().Should().Be("tech");
            first.GetProperty("l1").GetString().Should().Be("ai-ml");
            first.GetProperty("l2").ValueKind.Should().Be(JsonValueKind.Null);
        }
    }

    [SkippableFact]
    public async Task Returns429WithRetryAfterAndTheSearchMessage_AfterTheBudgetIsSpent()
    {
        await using JwtHttpTestHost host = await StartAsync(rateLimiting: true);

        for (int attempt = 0; attempt < 120; attempt++)
        {
            using HttpResponseMessage ok = await host.Client.GetAsync("/search?q=ab&types=categories");
            ok.StatusCode.Should().Be(HttpStatusCode.OK, $"request {attempt + 1} is inside the budget");
        }

        using HttpResponseMessage limited = await host.Client.GetAsync("/search?q=ab&types=categories");

        limited.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        limited.Headers.RetryAfter.Should().NotBeNull();
        JsonDocument.Parse(await limited.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString()
            .Should().Be("Too many searches. Please wait a moment and try again.");
    }

    [SkippableFact]
    public async Task RotatingXForwardedFor_DoesNotResetTheBudget()
    {
        await using JwtHttpTestHost host = await StartAsync(rateLimiting: true);

        HttpStatusCode last = HttpStatusCode.OK;
        for (int attempt = 0; attempt < 125; attempt++)
        {
            using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/search?q=ab&types=categories");
            request.Headers.Add("X-Forwarded-For", $"203.0.113.{attempt % 250 + 1}");
            using HttpResponseMessage response = await host.Client.SendAsync(request);
            last = response.StatusCode;
            if (attempt < 120)
            {
                response.StatusCode.Should().Be(HttpStatusCode.OK, $"request {attempt + 1} is inside the budget");
            }
        }

        last.Should().Be(HttpStatusCode.TooManyRequests);
    }
}
