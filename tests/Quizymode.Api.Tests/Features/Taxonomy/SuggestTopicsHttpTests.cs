using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Taxonomy;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.Services.TopicSuggestion;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Taxonomy;

/// <summary>
/// #322: POST /taxonomy/suggest over real HTTP with the production JWT pipeline and rate limiter. The database holds a
/// small curated fixture (never the 13.5k seed items); realistic accuracy lives in TopicSuggestionQualityTests.
/// </summary>
public sealed class SuggestTopicsHttpTests : TopicDbFixture
{
    private const string AiText = "Neural networks learn weights with backpropagation; deep learning models and machine learning training";

    private readonly CapturingLoggerProvider _logs = new();
    private TopicSuggestionHarness? _harness;

    private TopicSuggestionHarness Harness => _harness ?? throw new InvalidOperationException("Host not started.");

    private async Task<JwtHttpTestHost> StartAsync(bool rateLimiting = false)
    {
        _harness = new TopicSuggestionHarness(NewContext);
        TopicSuggestionHarness harness = _harness;
        return await JwtHttpTestHost.StartAsync(
            NewContext,
            services =>
            {
                services.AddLogging(builder => builder.AddProvider(_logs));
                services.AddMemoryCache();
                services.AddSingleton<ITaxonomyRegistry>(harness.Registry);
                services.AddSingleton(harness.Analyzer);
                services.AddSingleton(harness.Profiles);
                services.AddSingleton(harness.Suggester);
                services.AddSingleton<ITaxonomySearchIndex>(new TaxonomySearchIndex(harness.Registry));
                services.AddSingleton<TaxonomySearchCounts>();
            },
            app => new SuggestTopics.Endpoint().MapEndpoint(app),
            useRateLimiting: rateLimiting);
    }

    private (string Token, string UserId) SeedUser(JwtHttpTestHost host)
    {
        string subject = Guid.NewGuid().ToString();
        string email = $"{subject}@example.test";
        User user = new() { Id = Guid.NewGuid(), Subject = subject, Email = email, Name = subject };
        using ApplicationDbContext db = NewContext();
        db.Users.Add(user);
        db.SaveChanges();
        return (host.CreateToken(subject, email, emailVerified: true), user.Id.ToString());
    }

    private void SeedCuratedCorpus()
    {
        using ApplicationDbContext db = NewContext();
        foreach ((string l1, string l2, string question) in new[]
                 {
                     ("ai-ml", "deep-learning", "How does backpropagation update the weights of a neural network"),
                     ("ai-ml", "deep-learning", "What does a hidden layer in a deep learning model learn"),
                     ("ai-ml", "llms", "How does a large language model predict the next token"),
                     ("ai-ml", "ml-basics", "What is overfitting in machine learning training")
                 })
        {
            TopicSeed.AddItem(db, "tech", l1, l2, question);
        }

        foreach ((string l2, string question) in new[]
                 {
                     ("ec2", "Which EC2 instance family suits compute heavy workloads"),
                     ("s3", "Which S3 storage class is cheapest for archives of buckets"),
                     ("vpc", "How do VPC subnets and route tables isolate traffic")
                 })
        {
            TopicSeed.AddItem(db, "exams", "aws-topics", l2, question);
        }
    }

    private static HttpRequestMessage Post(string token, object body)
    {
        string json = body as string ?? JsonSerializer.Serialize(body);
        return JwtHttpTestHost.Request(HttpMethod.Post, "/taxonomy/suggest", token, new StringContent(json, Encoding.UTF8, "application/json"));
    }

    private static async Task<JsonElement> SuggestAsync(
        JwtHttpTestHost host,
        string token,
        string? text,
        int? limit = null,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        using HttpRequestMessage request = Post(token, new { text, limit });
        using HttpResponseMessage response = await host.Client.SendAsync(request);
        string body = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(expected, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static List<JsonElement> Suggestions(JsonElement root) => root.GetProperty("suggestions").EnumerateArray().ToList();

    private static string PathOf(JsonElement suggestion) =>
        $"{suggestion.GetProperty("categorySlug").GetString()}/{suggestion.GetProperty("l1").GetString()}/{suggestion.GetProperty("l2").GetString()}";

    [Fact]
    public async Task Anonymous_Gets401()
    {
        await using JwtHttpTestHost host = await StartAsync();

        using HttpRequestMessage request = Post(null!, new { text = AiText });
        using HttpResponseMessage response = await host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task AiText_SuggestsTechAiMlAmongTheFirstThree_WithReasonText()
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        JsonElement first = await SuggestAsync(host, token, AiText);
        await Harness.Profiles.CurrentLoad;
        JsonElement second = await SuggestAsync(host, token, AiText);

        foreach (JsonElement root in new[] { first, second })
        {
            List<JsonElement> top3 = Suggestions(root).Take(3).ToList();
            top3.Should().Contain(s => s.GetProperty("categorySlug").GetString() == "tech" && s.GetProperty("l1").GetString() == "ai-ml");
            top3.Should().OnlyContain(s => s.GetProperty("reason").GetString() == "text");
        }
    }

    [Fact]
    public async Task AwsText_SuggestsExamsAwsTopicsAmongTheFirstThree()
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        await SuggestAsync(host, token, "EC2 instances, S3 buckets and VPC subnets");
        await Harness.Profiles.CurrentLoad;
        JsonElement response = await SuggestAsync(host, token, "EC2 instances, S3 buckets and VPC subnets");

        Suggestions(response).Take(3).Should().Contain(s =>
            s.GetProperty("categorySlug").GetString() == "exams"
            && s.GetProperty("l1").GetString()!.StartsWith("aws", StringComparison.Ordinal));
    }

    [Fact]
    public async Task EverySuggestion_HasALeaf_ASlugPath_AndMatchedTermsFromTheInput()
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);
        await SuggestAsync(host, token, AiText);
        await Harness.Profiles.CurrentLoad;

        JsonElement response = await SuggestAsync(host, token, AiText, limit: 10);

        HashSet<string> inputWords = AiText.ToLowerInvariant().Split(' ', ';', ',').ToHashSet();
        List<JsonElement> suggestions = Suggestions(response);
        suggestions.Should().NotBeEmpty();
        foreach (JsonElement suggestion in suggestions)
        {
            string category = suggestion.GetProperty("categorySlug").GetString()!;
            string l1 = suggestion.GetProperty("l1").GetString()!;
            string l2 = suggestion.GetProperty("l2").GetString()!;
            Harness.Registry.IsValidNavigationPath(category, l1, l2).Should().BeTrue();
            suggestion.GetProperty("path").GetString().Should().Be($"{category} › {l1} › {l2}");
            suggestion.GetProperty("score").GetDouble().Should().BeInRange(0, 1);
            suggestion.GetProperty("matchedTerms").EnumerateArray().Select(t => t.GetString()!)
                .Should().OnlyContain(term => inputWords.Contains(term)).And.HaveCountLessThanOrEqualTo(5);
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("hi")]
    [InlineData("asdf qwer")]
    [InlineData("zzqxv zzqxv")]
    public async Task EmptyShortOrUnrecognisedText_ReturnsAFallbackList_WithoutScores(string? text)
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        JsonElement response = await SuggestAsync(host, token, text);

        List<JsonElement> suggestions = Suggestions(response);
        suggestions.Should().NotBeEmpty();
        suggestions.Should().HaveCountLessThanOrEqualTo(5);
        foreach (JsonElement suggestion in suggestions)
        {
            suggestion.GetProperty("reason").GetString().Should().BeOneOf("yours", "popular");
            suggestion.GetProperty("score").GetDouble().Should().Be(0);
            suggestion.GetProperty("matchedTerms").GetArrayLength().Should().Be(0);
        }
    }

    [Fact]
    public async Task Fallback_PutsTheCallersMostRecentPathsFirst_AsYours()
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, string userId) = SeedUser(host);
        using (ApplicationDbContext db = NewContext())
        {
            TopicSeed.AddItem(db, "science", "chemistry", "bonding", "my older question", createdBy: userId, isPrivate: true, createdAt: DateTime.UtcNow.AddDays(-5));
            TopicSeed.AddItem(db, "sports", "tennis", "players", "my newest question", createdBy: userId, createdAt: DateTime.UtcNow.AddDays(-1));
        }

        List<JsonElement> suggestions = Suggestions(await SuggestAsync(host, token, ""));

        suggestions.Take(2).Select(PathOf).Should().Equal("sports/tennis/players", "science/chemistry/bonding");
        suggestions.Take(2).Should().OnlyContain(s => s.GetProperty("reason").GetString() == "yours");
        suggestions.Skip(2).Should().OnlyContain(s => s.GetProperty("reason").GetString() == "popular");
        suggestions.Select(PathOf).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task Fallback_NeverShowsAnotherUsersPaths_AsYours()
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string tokenA, string userA) = SeedUser(host);
        (string tokenB, string userB) = SeedUser(host);
        using (ApplicationDbContext db = NewContext())
        {
            TopicSeed.AddItem(db, "science", "chemistry", "bonding", "a private chemistry question", createdBy: userA, isPrivate: true);
            TopicSeed.AddItem(db, "sports", "tennis", "players", "b private tennis question", createdBy: userB, isPrivate: true);
        }

        List<JsonElement> forA = Suggestions(await SuggestAsync(host, tokenA, ""));
        List<JsonElement> forB = Suggestions(await SuggestAsync(host, tokenB, ""));

        forA.Where(s => s.GetProperty("reason").GetString() == "yours").Select(PathOf).Should().Equal("science/chemistry/bonding");
        forB.Where(s => s.GetProperty("reason").GetString() == "yours").Select(PathOf).Should().Equal("sports/tennis/players");
        forB.Select(PathOf).Should().NotContain("science/chemistry/bonding", "private items of another user never surface");
        forA.Select(PathOf).Should().NotContain("sports/tennis/players");
    }

    [Fact]
    public async Task Fallback_OnAnEmptyDatabase_StillReturnsValidStaticPaths()
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        List<JsonElement> suggestions = Suggestions(await SuggestAsync(host, token, "", limit: 8));

        suggestions.Should().HaveCount(8);
        suggestions.Should().OnlyContain(s => s.GetProperty("reason").GetString() == "popular");
        suggestions.Select(PathOf).Should().OnlyHaveUniqueItems();
        suggestions.Should().OnlyContain(s => Harness.Registry.IsValidNavigationPath(
            s.GetProperty("categorySlug").GetString()!, s.GetProperty("l1").GetString()!, s.GetProperty("l2").GetString()!));
    }

    [Fact]
    public async Task PopularFallback_SkipsLegacyPaths_AndPrivateItems()
    {
        using (ApplicationDbContext db = NewContext())
        {
            for (int index = 0; index < 5; index++)
            {
                TopicSeed.AddItem(db, "tech", "ai-ml", "legacy-leaf", $"public legacy question {index}");
                TopicSeed.AddItem(db, "science", "chemistry", "bonding", $"private chemistry question {index}", isPrivate: true);
            }

            TopicSeed.AddItem(db, "tech", "ai-ml", "llms", "one public valid question");
        }

        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        List<JsonElement> suggestions = Suggestions(await SuggestAsync(host, token, ""));

        suggestions[0].Should().Match<JsonElement>(s => PathOf(s) == "tech/ai-ml/llms");
        suggestions.Select(PathOf).Should().NotContain("tech/ai-ml/legacy-leaf").And.NotContain("science/chemistry/bonding");
    }

    [Fact]
    public async Task Limit_DefaultsToFive_AndIsHonoured()
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        Suggestions(await SuggestAsync(host, token, "")).Should().HaveCount(5);
        Suggestions(await SuggestAsync(host, token, "", limit: 3)).Should().HaveCount(3);
        Suggestions(await SuggestAsync(host, token, "", limit: 10)).Should().HaveCount(10);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    [InlineData(-1)]
    public async Task OutOfRangeLimit_Returns400(int limit)
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        JsonElement problem = await SuggestAsync(host, token, "", limit, HttpStatusCode.BadRequest);

        problem.GetProperty("detail").GetString().Should().Be("limit must be between 1 and 10.");
    }

    [Fact]
    public async Task TooLongText_Returns400_WithoutEchoingTheTextOrLoggingIt()
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);
        string text = "zzuniquetoken " + new string('x', 5001);

        using HttpRequestMessage request = Post(token, new { text });
        using HttpResponseMessage response = await host.Client.SendAsync(request);
        string body = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        body.Should().NotContain("zzuniquetoken");
        JsonDocument.Parse(body).RootElement.GetProperty("detail").GetString().Should().Be("text must be at most 5000 characters.");
        _logs.Entries.Should().NotContain(entry => entry.Message.Contains("zzuniquetoken") || (entry.Exception != null && entry.Exception.ToString().Contains("zzuniquetoken")));
    }

    [Fact]
    public async Task TextAtTheLimit_IsAccepted()
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        await SuggestAsync(host, token, new string('x', 5000));
    }

    [Fact]
    public async Task AnOversizedBody_IsRejectedBeforeItIsRead()
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);
        string json = JsonSerializer.Serialize(new { text = "zzuniquetoken " + new string('x', 70 * 1024) });

        using HttpRequestMessage request = Post(token, json);
        using HttpResponseMessage response = await host.Client.SendAsync(request);

        response.StatusCode.Should().BeOneOf(HttpStatusCode.RequestEntityTooLarge, HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().NotContain("zzuniquetoken");
    }

    [Fact]
    public async Task APrivateItemsUniqueWord_NeverMakesItsNodeMatch_AndTheTextIsNeverLogged()
    {
        using (ApplicationDbContext db = NewContext())
        {
            TopicSeed.AddItem(db, "tech", "ai-ml", "llms", "a secret zzqxv question about zzqxv", isPrivate: true, createdBy: "someone-else");
            TopicSeed.AddItem(db, "tech", "ai-ml", "deep-learning", "a public question about neural networks");
        }

        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        // A normal text call makes the profiles load; then the private word is queried against the loaded profiles.
        await SuggestAsync(host, token, AiText);
        await Harness.Profiles.CurrentLoad;
        Harness.Profiles.Model.ProfileItemCount.Should().Be(1);
        JsonElement response = await SuggestAsync(host, token, "zzqxv zzqxv");

        Suggestions(response).Should().OnlyContain(s => s.GetProperty("reason").GetString() != "text");
        _logs.Entries.Should().NotContain(entry => entry.Message.Contains("zzqxv"));
    }

    [Fact]
    public async Task FallbackOnlyRequests_NeverStartAProfileLoad_ButTextRequestsDo()
    {
        SeedCuratedCorpus();
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);
        Recorder.ProjectionQueries.Should().Be(0, "startup runs no item-profile query");

        foreach (string? text in new[] { null, "", "hi", "asdf" })
        {
            await SuggestAsync(host, token, text);
        }

        Harness.Profiles.LoadsStarted.Should().Be(0);
        Recorder.ProjectionQueries.Should().Be(0);
        Recorder.FingerprintQueries.Should().Be(0);

        await SuggestAsync(host, token, AiText);
        await Harness.Profiles.CurrentLoad;
        await SuggestAsync(host, token, AiText);
        await Harness.Profiles.CurrentLoad;

        Harness.Profiles.LoadsStarted.Should().Be(1);
        Recorder.ProjectionQueries.Should().Be(1);
    }

    [Fact]
    public async Task The61stCallInAMinute_Gets429WithRetryAfter_ForThatUserOnly()
    {
        await using JwtHttpTestHost host = await StartAsync(rateLimiting: true);
        (string tokenA, _) = SeedUser(host);
        (string tokenB, _) = SeedUser(host);

        for (int call = 0; call < 60; call++)
        {
            await SuggestAsync(host, tokenA, "");
        }

        using (HttpRequestMessage limited = Post(tokenA, new { text = "" }))
        using (HttpResponseMessage response = await host.Client.SendAsync(limited))
        {
            response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
            response.Headers.RetryAfter.Should().NotBeNull();
            JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString()
                .Should().Be("Too many topic suggestions. Please wait a moment and try again.");
        }

        await SuggestAsync(host, tokenB, "");
    }

    [Fact]
    public async Task MalformedBody_Returns400()
    {
        await using JwtHttpTestHost host = await StartAsync();
        (string token, _) = SeedUser(host);

        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, "/taxonomy/suggest", token, new StringContent("{ not json", Encoding.UTF8, MediaTypeHeaderValue.Parse("application/json").MediaType));
        using HttpResponseMessage response = await host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public void RejectionDetail_ForTheSuggestPath_IsTheTopicSuggestionMessage()
    {
        Quizymode.Api.StartupExtensions.StartupExtensions.GetRejectionDetail(new Microsoft.AspNetCore.Http.PathString("/taxonomy/suggest"))
            .Should().Be("Too many topic suggestions. Please wait a moment and try again.");
    }
}
