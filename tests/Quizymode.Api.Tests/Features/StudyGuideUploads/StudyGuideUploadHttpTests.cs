using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features.StudyGuideUploads;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

/// <summary>Over real HTTP: auth is required, and with no Anthropic key the feature reports itself disabled (503).</summary>
public sealed class StudyGuideUploadHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Anthropic:ApiKey"] = "" })
            .Build();

        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                new CreateStudyGuideUpload.FeatureRegistration().AddToServiceCollection(services, configuration);
                services.AddSingleton(StudyGuideUploadTestData.Moderation());
                services.AddSingleton(Mock.Of<ITaxonomyItemCategoryResolver>());
                services.AddSingleton(Mock.Of<ITaxonomyRegistry>());
            },
            app =>
            {
                new CreateStudyGuideUpload.Endpoint().MapEndpoint(app);
                new GetStudyGuideUploadConfig.Endpoint().MapEndpoint(app);
                new GetStudyGuideUpload.Endpoint().MapEndpoint(app);
            });
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private static JsonContent Body() =>
        JsonContent.Create(new { text = "Some notes", category = "Science", navigationKeyword1 = "biology", navigationKeyword2 = "plants" });

    [Fact]
    public async Task Create_RequiresAuthentication()
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, "/study-guide-uploads", content: Body());
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Create_WithoutApiKey_Returns503Disabled()
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, "/study-guide-uploads", _host.CreateToken("member", "member@example.com"), Body());
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        using JsonDocument problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        problem.RootElement.GetProperty("title").GetString().Should().Be("StudyGuideUpload.Disabled");
    }

    [Fact]
    public async Task Config_WithoutApiKey_ReportsDisabled()
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Get, "/study-guide-uploads/config", _host.CreateToken("member", "member@example.com"));
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        GetStudyGuideUploadConfig.Response? config = await response.Content.ReadFromJsonAsync<GetStudyGuideUploadConfig.Response>();
        config!.Enabled.Should().BeFalse();
        config.MaxTextBytes.Should().Be(10240);
    }

    [Fact]
    public async Task Get_UnknownUpload_Returns404()
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Get, $"/study-guide-uploads/{Guid.NewGuid()}", _host.CreateToken("member", "member@example.com"));
        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
