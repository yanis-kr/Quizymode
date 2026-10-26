using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features;
using Quizymode.Api.Services;
using Quizymode.Api.StartupExtensions;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

/// <summary>
/// #240: the legacy one-shot <c>/study-guide-uploads</c> flow was removed; #296 PR 4 retired <c>/study-guides/current</c>
/// and <c>/study-guides/import/*</c>. The request goes through
/// a host that maps every discovered <see cref="IEndpoint"/> (the same discovery as production), so a 404 proves no
/// slice still serves the route.
/// </summary>
public sealed class LegacyStudyGuideRoutesRemovedHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                IConfiguration configuration = new ConfigurationBuilder().Build();
                foreach (Type registrationType in typeof(IFeatureRegistration).Assembly.GetTypes()
                             .Where(t => t is { IsClass: true, IsAbstract: false } && t.GetInterfaces().Contains(typeof(IFeatureRegistration))))
                {
                    ((IFeatureRegistration)Activator.CreateInstance(registrationType)!).AddToServiceCollection(services, configuration);
                }

                // Endpoint parameters are inferred at startup, so every service interface an endpoint can ask for
                // must resolve. Mocks stand in for whatever the feature registrations do not provide.
                services.AddOptions();
                services.AddMemoryCache();
                foreach (Type serviceType in typeof(IEndpoint).Assembly.GetTypes()
                             .Where(t => t is { IsInterface: true, IsGenericTypeDefinition: false, IsPublic: true }
                                         && t.Namespace?.StartsWith("Quizymode.Api.Services", StringComparison.Ordinal) == true))
                {
                    if (services.All(d => d.ServiceType != serviceType))
                    {
                        object mock = ((Mock)Activator.CreateInstance(typeof(Mock<>).MakeGenericType(serviceType))!).Object;
                        services.AddSingleton(serviceType, mock);
                    }
                }
            },
            // The host's route builder is the WebApplication; use the production endpoint discovery.
            app => ((WebApplication)app).MapFeatureEndpoints());
    }

    [Fact]
    public async Task GetStudyGuideDocuments_IsNotNotFound_ProvingTheRouteTableWasBuilt()
    {
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Get, "/study-guides/documents", _host.CreateToken("member", "member@example.com"));

        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().NotBe(HttpStatusCode.NotFound);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Theory]
    [InlineData("POST", "/study-guide-uploads")]
    [InlineData("GET", "/study-guide-uploads/config")]
    [InlineData("GET", "/study-guide-uploads/3f2b8c1e-0000-4000-8000-000000000001")]
    [InlineData("POST", "/study-guide-uploads/3f2b8c1e-0000-4000-8000-000000000001/accept")]
    [InlineData("GET", "/study-guides/current")]
    [InlineData("PUT", "/study-guides/current")]
    [InlineData("DELETE", "/study-guides/current")]
    [InlineData("POST", "/study-guides/import/sessions")]
    [InlineData("GET", "/study-guides/import/sessions/3f2b8c1e-0000-4000-8000-000000000001")]
    [InlineData("POST", "/study-guides/import/sessions/3f2b8c1e-0000-4000-8000-000000000001/generate-chunks")]
    [InlineData("POST", "/study-guides/import/sessions/3f2b8c1e-0000-4000-8000-000000000001/chunks/0/result")]
    [InlineData("POST", "/study-guides/import/sessions/3f2b8c1e-0000-4000-8000-000000000001/dedup-result")]
    [InlineData("POST", "/study-guides/import/sessions/3f2b8c1e-0000-4000-8000-000000000001/finalize")]
    public async Task LegacyStudyGuideRoutes_ReturnNotFound_ForAnonymousAndMemberCallers(string method, string path)
    {
        HttpMethod httpMethod = new(method);
        using HttpRequestMessage anonymous = JwtHttpTestHost.Request(
            httpMethod, path, null, method is "POST" or "PUT" ? JsonContent("{}") : null);
        using HttpRequestMessage member = JwtHttpTestHost.Request(
            httpMethod, path, _host.CreateToken("member", "member@example.com"), method is "POST" or "PUT" ? JsonContent("{}") : null);

        using HttpResponseMessage anonymousResponse = await _host.Client.SendAsync(anonymous);
        using HttpResponseMessage memberResponse = await _host.Client.SendAsync(member);

        anonymousResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
        memberResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private static StringContent JsonContent(string json) =>
        new(json, System.Text.Encoding.UTF8, "application/json");
}
