using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Comments;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.Items.UploadToCollection;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.Features.StudyGuideDocuments;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Quotas;

// AC 17.4 and 17.5 (#904): every creating endpoint over real HTTP with the production JWT policy and low configured quotas.
public sealed class CreationQuotaHttpTests : StudyGuideDocumentFixture, IAsyncDisposable
{
    private static readonly string[] AdminGroups = ["Admins"];

    private JwtHttpTestHost _host = null!;

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();
        IConfiguration configuration = new ConfigurationBuilder().Build();
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                new AddItem.FeatureRegistration().AddToServiceCollection(services, configuration);
                new UploadItemsToCollection.FeatureRegistration().AddToServiceCollection(services, configuration);
                new AddCollection.FeatureRegistration().AddToServiceCollection(services, configuration);
                new AddComment.FeatureRegistration().AddToServiceCollection(services, configuration);
                services.AddScoped<FluentValidation.IValidator<AcceptStudyGuideCandidates.Request>, AcceptStudyGuideCandidates.Validator>();
                services.AddSingleton(StudyGuideTestData.Moderation());
                services.AddSingleton(TaxonomyRegistry);
                services.AddScoped<ITaxonomyItemCategoryResolver>(provider =>
                    new TaxonomyItemCategoryResolver(provider.GetRequiredService<ApplicationDbContext>(), TaxonomyRegistry));
                services.AddSingleton(SimHashService);
                services.AddSingleton(TimeProvider.System);
            },
            app =>
            {
                new AddItem.Endpoint().MapEndpoint(app);
                new UploadItemsToCollection.Endpoint().MapEndpoint(app);
                new AddCollection.Endpoint().MapEndpoint(app);
                new AddComment.Endpoint().MapEndpoint(app);
                new AcceptStudyGuideCandidates.Endpoint().MapEndpoint(app);
            },
            useRateLimiting: true,
            extraConfiguration: new Dictionary<string, string?>
            {
                ["Quotas:ItemsPerDay"] = "1",
                ["Quotas:CollectionsPerDay"] = "1",
                ["Quotas:CommentsPerDay"] = "1"
            });
    }

    async ValueTask IAsyncDisposable.DisposeAsync() => await _host.DisposeAsync();

    private string UserToken() => _host.CreateToken("user-a", "user-a@example.com");

    private string AdminToken() => _host.CreateToken("quota-admin", "quota-admin@example.com", AdminGroups);

    private async Task<HttpResponseMessage> PostAsync(string path, string token, object body)
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, path, token, JsonContent.Create(body));
        return await _host.Client.SendAsync(request);
    }

    private static async Task AssertQuotaRefusalAsync(HttpResponseMessage response, string code, string noun)
    {
        string body = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(HttpStatusCode.TooManyRequests, body);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        response.Headers.RetryAfter!.Delta!.Value.Should().BeGreaterThan(TimeSpan.Zero).And.BeLessThanOrEqualTo(TimeSpan.FromDays(1));
        using JsonDocument problem = JsonDocument.Parse(body);
        problem.RootElement.GetProperty("title").GetString().Should().Be(code);
        problem.RootElement.GetProperty("detail").GetString().Should().Contain($"Daily {noun} limit reached");
        problem.RootElement.GetProperty("type").GetString().Should().Be("https://tools.ietf.org/html/rfc6585#section-4");
    }

    private static AddItem.Request ItemRequest(string question) =>
        new("geography", "capitals", "europe", true, question, "Paris", ["Lyon", "Nice"], "Because.");

    private static UploadItemsToCollection.Request UploadRequest(string inputText, params string[] questions) =>
        new(
            "geography",
            "capitals",
            "europe",
            [],
            questions.Select(question => new AddItemsBulk.ItemRequest(question, "Paris", ["Lyon", "Nice"], "Because.")).ToList(),
            inputText);

    [Fact]
    public async Task Items_BeyondTheQuota_Are429AndStoreNothing_AdminPasses()
    {
        using HttpResponseMessage first = await PostAsync("items", UserToken(), ItemRequest("What is the capital of France?"));
        first.StatusCode.Should().Be(HttpStatusCode.Created, await first.Content.ReadAsStringAsync());

        using HttpResponseMessage second = await PostAsync("items", UserToken(), ItemRequest("Which river flows through Cairo?"));

        await AssertQuotaRefusalAsync(second, "Quota.ItemsPerDay", "item");
        (await CreateDbContext().Items.CountAsync()).Should().Be(1);

        foreach (string question in new[] { "What is the capital of Spain?", "Which mountain is the highest on Earth?" })
        {
            using HttpResponseMessage admin = await PostAsync("items", AdminToken(), ItemRequest(question));
            admin.StatusCode.Should().Be(HttpStatusCode.Created, await admin.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Upload_CrossingTheItemQuota_StoresNoItemCollectionOrUpload_AdminPasses()
    {
        UploadItemsToCollection.Request request = UploadRequest("two", "What is the capital of France?", "Which river flows through Cairo?");

        using HttpResponseMessage refused = await PostAsync("items/upload-to-collection", UserToken(), request);

        await AssertQuotaRefusalAsync(refused, "Quota.ItemsPerDay", "item");
        ApplicationDbContext verify = CreateDbContext();
        (await verify.Items.CountAsync()).Should().Be(0);
        (await verify.Collections.CountAsync()).Should().Be(0);
        (await verify.Uploads.CountAsync()).Should().Be(0);

        using HttpResponseMessage admin = await PostAsync("items/upload-to-collection", AdminToken(), request);
        admin.StatusCode.Should().Be(HttpStatusCode.Created, await admin.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Upload_AtTheCollectionQuota_StoresNoItemOrUpload()
    {
        using HttpResponseMessage collection = await PostAsync("collections", UserToken(), new AddCollection.Request("Mine"));
        collection.StatusCode.Should().Be(HttpStatusCode.Created);

        using HttpResponseMessage refused = await PostAsync(
            "items/upload-to-collection", UserToken(), UploadRequest("one", "What is the capital of France?"));

        await AssertQuotaRefusalAsync(refused, "Quota.CollectionsPerDay", "collection");
        ApplicationDbContext verify = CreateDbContext();
        (await verify.Items.CountAsync()).Should().Be(0);
        (await verify.Uploads.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Collections_BeyondTheQuota_Are429AndStoreNothing_AdminPasses()
    {
        using HttpResponseMessage first = await PostAsync("collections", UserToken(), new AddCollection.Request("First"));
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        using HttpResponseMessage second = await PostAsync("collections", UserToken(), new AddCollection.Request("Second"));

        await AssertQuotaRefusalAsync(second, "Quota.CollectionsPerDay", "collection");
        (await CreateDbContext().Collections.CountAsync()).Should().Be(1);

        for (int i = 0; i < 2; i++)
        {
            using HttpResponseMessage admin = await PostAsync("collections", AdminToken(), new AddCollection.Request($"Admin {i}"));
            admin.StatusCode.Should().Be(HttpStatusCode.Created);
        }
    }

    [Fact]
    public async Task Comments_BeyondTheQuota_Are429AndStoreNothing_AdminPasses()
    {
        Item item = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of France?", "Paris", ["Lyon"], "", isPrivate: false, createdBy: "seeder");
        using HttpResponseMessage first = await PostAsync("comments", UserToken(), new AddComment.Request(item.Id, "One"));
        first.StatusCode.Should().Be(HttpStatusCode.Created, await first.Content.ReadAsStringAsync());

        using HttpResponseMessage second = await PostAsync("comments", UserToken(), new AddComment.Request(item.Id, "Two"));

        await AssertQuotaRefusalAsync(second, "Quota.CommentsPerDay", "comment");
        (await CreateDbContext().Comments.CountAsync()).Should().Be(1);

        for (int i = 0; i < 2; i++)
        {
            using HttpResponseMessage admin = await PostAsync("comments", AdminToken(), new AddComment.Request(item.Id, $"Admin {i}"));
            admin.StatusCode.Should().Be(HttpStatusCode.Created);
        }
    }

    [Fact]
    public async Task Accept_BeyondTheItemQuota_Is429AndStoresNothing_AdminPasses()
    {
        (Guid documentId, AcceptStudyGuideCandidates.Request request) = await GeneratedDocumentAsync(UserA);

        using HttpResponseMessage refused = await PostAsync($"study-guides/documents/{documentId}/accept", UserToken(), request);

        await AssertQuotaRefusalAsync(refused, "Quota.ItemsPerDay", "item");
        ApplicationDbContext verify = CreateDbContext();
        (await verify.Items.CountAsync()).Should().Be(0);
        (await verify.Collections.CountAsync()).Should().Be(0);
        (await verify.StudyGuideAcceptedCandidates.CountAsync()).Should().Be(0);

        // The admin owns a second document over the same generated questions.
        using HttpResponseMessage seedUser = await PostAsync("collections", AdminToken(), new AddCollection.Request("Admin"));
        seedUser.StatusCode.Should().Be(HttpStatusCode.Created);
        string adminId = (await CreateDbContext().Users.SingleAsync(u => u.Subject == "quota-admin")).Id.ToString();
        StudyGuideDocumentContracts.Document adminDocument = await CreateTextAsync(MultiSectionText(1), adminId, "Admin notes");
        await GenerateAsync(Guid.Parse(adminDocument.Id), adminDocument.Sections.Select(s => Guid.Parse(s.Id)), adminId);
        StudyGuideDocumentContracts.Document ready = (await GetAsync(adminDocument.Id, adminId))!;

        using HttpResponseMessage admin = await PostAsync(
            $"study-guides/documents/{adminDocument.Id}/accept", AdminToken(), Pick(ready));

        admin.StatusCode.Should().Be(HttpStatusCode.OK, await admin.Content.ReadAsStringAsync());
        (await CreateDbContext().Items.CountAsync()).Should().BeGreaterThan(1);
    }

    private async Task<(Guid DocumentId, AcceptStudyGuideCandidates.Request Request)> GeneratedDocumentAsync(string userId)
    {
        StudyGuideDocumentContracts.Document document = await CreateTextAsync(MultiSectionText(1), userId);
        await GenerateAsync(Guid.Parse(document.Id), document.Sections.Select(s => Guid.Parse(s.Id)), userId);
        await CompleteGenerationAsync(await GenerationIdOfAsync(document.Sections[0].Id), candidates: 2);
        return (Guid.Parse(document.Id), Pick((await GetAsync(document.Id, userId))!));
    }

    private static AcceptStudyGuideCandidates.Request Pick(StudyGuideDocumentContracts.Document document) =>
        new(document.Sections[0].Candidates
            .Select(candidate => new AcceptStudyGuideCandidates.CandidateEdit(Guid.Parse(candidate.Id), null, null, null, null))
            .ToList());
}
