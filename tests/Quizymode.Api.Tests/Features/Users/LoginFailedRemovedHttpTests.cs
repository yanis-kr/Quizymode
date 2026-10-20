using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features;
using Quizymode.Api.Services;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Users;

/// <summary>
/// #235: <c>POST /auth/login-failed</c> was unauthenticated and unused, so it was removed. The request goes through
/// a host that maps every discovered <see cref="IEndpoint"/> (the same discovery as production), so a 404 proves no
/// slice still serves the route.
/// </summary>
public sealed class LoginFailedRemovedHttpTests : DatabaseTestFixture, IAsyncLifetime
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
            app =>
            {
                foreach (Type endpointType in typeof(IEndpoint).Assembly.GetTypes()
                             .Where(t => t is { IsClass: true, IsAbstract: false } && t.GetInterfaces().Contains(typeof(IEndpoint)))
                             .OrderBy(t => t.FullName, StringComparer.Ordinal))
                {
                    ((IEndpoint)Activator.CreateInstance(endpointType)!).MapEndpoint(app);
                }
            });
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task PostAuthLoginFailed_ReturnsNotFound_ForAnonymousAndAuthenticatedCallers()
    {
        using HttpRequestMessage anonymous = JwtHttpTestHost.Request(
            HttpMethod.Post, "/auth/login-failed", null, JsonContent("""{"username":"someone@example.com"}"""));
        using HttpRequestMessage authenticated = JwtHttpTestHost.Request(
            HttpMethod.Post, "/auth/login-failed", _host.CreateToken("member", "member@example.com"),
            JsonContent("""{"username":"someone@example.com"}"""));

        using HttpResponseMessage anonymousResponse = await _host.Client.SendAsync(anonymous);
        using HttpResponseMessage authenticatedResponse = await _host.Client.SendAsync(authenticated);

        anonymousResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
        authenticatedResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    private static StringContent JsonContent(string json) =>
        new(json, System.Text.Encoding.UTF8, "application/json");
}
