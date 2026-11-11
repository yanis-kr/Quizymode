using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>AC 7.8: the DevTest scheme exists only in Development and parses only well-formed headers.</summary>
public sealed class DevelopmentTestAuthTests
{
    [Fact]
    public async Task ProductionEnvironment_DoesNotRegisterTheDevTestScheme()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Production,
            ContentRootPath = AppContext.BaseDirectory,
        });
        builder.Services.AddAuthentication();

        builder.AddDevelopmentTestAuthentication();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        IAuthenticationSchemeProvider schemes = provider.GetRequiredService<IAuthenticationSchemeProvider>();
        IEnumerable<string> names = (await schemes.GetAllSchemesAsync()).Select(scheme => scheme.Name);
        names.Should().NotContain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Fact]
    public async Task DevelopmentEnvironment_RegistersTheDevTestScheme()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Development,
            ContentRootPath = AppContext.BaseDirectory,
        });
        builder.Services.AddAuthentication();

        builder.AddDevelopmentTestAuthentication();

        using ServiceProvider provider = builder.Services.BuildServiceProvider();
        IAuthenticationSchemeProvider schemes = provider.GetRequiredService<IAuthenticationSchemeProvider>();
        IEnumerable<string> names = (await schemes.GetAllSchemesAsync()).Select(scheme => scheme.Name);
        names.Should().Contain(DevelopmentTestAuthExtensions.SchemeName);
    }

    [Theory]
    [InlineData("DevTest alice", "alice", false)]
    [InlineData("DevTest alice admin", "alice", true)]
    [InlineData("DevTest user_1-2", "user_1-2", false)]
    public void TryParseHeader_AcceptsWellFormedHeaders(string header, string expectedUser, bool expectedAdmin)
    {
        bool ok = DevelopmentTestAuthExtensions.TryParseHeader(header, out string userId, out bool isAdmin);

        ok.Should().BeTrue();
        userId.Should().Be(expectedUser);
        isAdmin.Should().Be(expectedAdmin);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Bearer eyJhbGciOi")]
    [InlineData("DevTest")]
    [InlineData("DevTest ")]
    [InlineData("DevTest alice owner")]
    [InlineData("DevTest alice admin extra")]
    [InlineData("DevTest ali;ce")]
    public void TryParseHeader_RejectsMalformedHeaders(string? header)
    {
        bool ok = DevelopmentTestAuthExtensions.TryParseHeader(header, out _, out bool isAdmin);

        ok.Should().BeFalse();
        isAdmin.Should().BeFalse();
    }
}
