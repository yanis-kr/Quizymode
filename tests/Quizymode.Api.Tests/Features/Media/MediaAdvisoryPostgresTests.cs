using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Media;
using Quizymode.Api.Features.Media.Storage;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Media;

/// <summary>The AI-call budget is counted under the shared advisory lock, so concurrent calls at the budget admit exactly one (AC 3.28.7).</summary>
[Trait("Category", "Postgres")]
public sealed class MediaAdvisoryPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private sealed class UnavailableProvider : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    }

    [SkippableFact]
    public async Task ConcurrentAdvisoryCallsAtBudgetAdmitExactlyOne()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        List<Guid> itemIds = [];
        await using (ApplicationDbContext seed = fixture.CreateDbContext())
        {
            seed.MediaControls.Add(new MediaControl { AdvisoryEnabled = true });
            Category category = VisibilitySeed.AddCategory(seed);
            for (int i = 0; i < 4; i++)
            {
                MediaAsset asset = PictureSeed.AddAsset(seed, "race-owner");
                itemIds.Add(PictureSeed.AddPictureItem(seed, category, "race-owner", true, ItemImageReviewState.PendingReview, asset).Id);
            }

            await seed.SaveChangesAsync();
        }

        MediaAdvisoryOptions options = new() { Enabled = true, ProcessingTermsAccepted = true, PrivateContentAllowed = true, DailyCallBudget = 1, OwnerDailyCallBudget = 1 };
        using HttpClient providerHttp = new(new UnavailableProvider());
        IConfiguration config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Gemini:ApiKey"] = "synthetic-not-a-real-key" }).Build();
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(() => fixture.CreateDbContext(), services =>
        {
            services.AddSingleton(Options.Create(options));
            services.AddSingleton<IMediaObjectStore>(new FakeMediaObjectStore());
            services.AddSingleton(new GeminiMediaAdvisory(providerHttp, config));
        }, app => new MediaAdvisoryEndpoints.Endpoint().MapEndpoint(app));
        string admin = host.CreateToken("race-admin", "admin@example.test", ["Admins"]);

        HttpResponseMessage[] responses = await Task.WhenAll(itemIds.Select(id => host.Client.SendAsync(
            JwtHttpTestHost.Request(HttpMethod.Post, $"/admin/items/{id}/image-advisory", admin, JsonContent.Create(new { expectedRevision = 1 })))));

        responses.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1, "only one call fits the daily budget");
        string statuses = string.Join(",", responses.Select(r => (int)r.StatusCode));
        responses.Count(r => r.StatusCode == HttpStatusCode.TooManyRequests).Should().Be(3, $"every rejected call must be 429; statuses were [{statuses}]");
        foreach (HttpResponseMessage response in responses.Where(r => r.StatusCode == HttpStatusCode.TooManyRequests))
        {
            response.Headers.RetryAfter.Should().NotBeNull();
        }

        await using ApplicationDbContext verify = fixture.CreateDbContext();
        (await verify.MediaAdvisoryJobs.CountAsync()).Should().Be(1);
        foreach (HttpResponseMessage response in responses) response.Dispose();
    }
}
