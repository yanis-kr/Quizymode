using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Users;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Users;

/// <summary>#222: whether a signed-in user must accept the current Terms of Service and Privacy Policy.</summary>
public sealed class GetPolicyAcceptanceStatusTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(Guid userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId.ToString());
        return ctx;
    }

    private async Task<Guid> AddUserAsync(params (string Type, string Version)[] acceptances)
    {
        User user = new() { Id = Guid.NewGuid(), Subject = $"sub-{Guid.NewGuid():N}", Email = $"{Guid.NewGuid():N}@example.com" };
        DbContext.Users.Add(user);
        foreach ((string type, string version) in acceptances)
        {
            DbContext.UserPolicyAcceptances.Add(new UserPolicyAcceptance
            {
                UserId = user.Id,
                PolicyType = type,
                PolicyVersion = version
            });
        }

        await DbContext.SaveChangesAsync();
        return user.Id;
    }

    [Fact]
    public async Task UserWithNoAcceptances_NeedsBothPolicies()
    {
        Guid userId = await AddUserAsync();

        var result = await GetPolicyAcceptanceStatus.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.NeedsAcceptance.Should().BeTrue();
        result.Value.Policies.Should().BeEquivalentTo(new[]
        {
            new GetPolicyAcceptanceStatus.PolicyStatus("TermsOfService", CurrentPolicyVersions.TermsOfService, null, true),
            new GetPolicyAcceptanceStatus.PolicyStatus("PrivacyPolicy", CurrentPolicyVersions.PrivacyPolicy, null, true)
        });
    }

    [Fact]
    public async Task OutdatedPrivacyAcceptance_NeedsPrivacyOnly_AndReportsLatestAcceptedVersion()
    {
        Guid userId = await AddUserAsync(
            ("TermsOfService", CurrentPolicyVersions.TermsOfService),
            ("PrivacyPolicy", "2026-10-15"),
            ("PrivacyPolicy", "2026-10-16"));

        var result = await GetPolicyAcceptanceStatus.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.Value!.NeedsAcceptance.Should().BeTrue();
        result.Value.Policies.Should().BeEquivalentTo(new[]
        {
            new GetPolicyAcceptanceStatus.PolicyStatus("TermsOfService", CurrentPolicyVersions.TermsOfService, CurrentPolicyVersions.TermsOfService, false),
            new GetPolicyAcceptanceStatus.PolicyStatus("PrivacyPolicy", CurrentPolicyVersions.PrivacyPolicy, "2026-10-16", true)
        });
    }

    [Fact]
    public async Task CurrentAcceptances_NeedNothing()
    {
        Guid userId = await AddUserAsync(
            ("TermsOfService", CurrentPolicyVersions.TermsOfService),
            ("PrivacyPolicy", CurrentPolicyVersions.PrivacyPolicy));

        var result = await GetPolicyAcceptanceStatus.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.Value!.NeedsAcceptance.Should().BeFalse();
        result.Value.Policies.Should().OnlyContain(p => !p.NeedsAcceptance && p.AcceptedVersion == p.CurrentVersion);
    }

    [Fact]
    public async Task AnotherUsersAcceptances_DoNotCount()
    {
        await AddUserAsync(
            ("TermsOfService", CurrentPolicyVersions.TermsOfService),
            ("PrivacyPolicy", CurrentPolicyVersions.PrivacyPolicy));
        Guid userId = await AddUserAsync();

        var result = await GetPolicyAcceptanceStatus.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.Value!.NeedsAcceptance.Should().BeTrue();
    }

    [Fact]
    public async Task RecordingTheCurrentVersions_SatisfiesTheStatus()
    {
        Guid userId = await AddUserAsync();
        Mock<IUserContext> user = AuthenticatedUser(userId);
        DateTime acceptedAt = DateTime.UtcNow;

        await RecordPolicyAcceptances.HandleAsync(
            new RecordPolicyAcceptances.Request(
            [
                new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", CurrentPolicyVersions.TermsOfService, acceptedAt),
                new RecordPolicyAcceptances.PolicyAcceptanceItem("PrivacyPolicy", CurrentPolicyVersions.PrivacyPolicy, acceptedAt)
            ]),
            DbContext,
            user.Object,
            new Microsoft.AspNetCore.Http.DefaultHttpContext(),
            CancellationToken.None);

        var result = await GetPolicyAcceptanceStatus.HandleAsync(DbContext, user.Object, CancellationToken.None);

        result.Value!.NeedsAcceptance.Should().BeFalse();
    }
}

public sealed class PolicyAcceptanceStatusHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(CreateDbContext, _ => { }, app => new GetPolicyAcceptanceStatus.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task Status_RejectsAnonymousCallers_AndAnswersSignedInOnes()
    {
        using HttpRequestMessage anonymous = JwtHttpTestHost.Request(HttpMethod.Get, "/users/policy-acceptances/status");
        using HttpResponseMessage anonymousResponse = await _host.Client.SendAsync(anonymous);
        anonymousResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        using HttpRequestMessage signedIn = JwtHttpTestHost.Request(
            HttpMethod.Get, "/users/policy-acceptances/status", _host.CreateToken("member", "member@example.com"));
        using HttpResponseMessage signedInResponse = await _host.Client.SendAsync(signedIn);
        signedInResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        GetPolicyAcceptanceStatus.Response? body = await signedInResponse.Content.ReadFromJsonAsync<GetPolicyAcceptanceStatus.Response>();
        body!.NeedsAcceptance.Should().BeTrue();
        body.Policies.Should().HaveCount(2);
    }
}

/// <summary>The signup form queues the SPA's policy versions; they must be the server's current ones, or new users get re-prompted.</summary>
public sealed class CurrentPolicyVersionsTests
{
    [Fact]
    public void SpaSignupVersions_MatchTheServerOwnedVersions()
    {
        string source = File.ReadAllText(Path.Combine(
            FindRepoRoot(), "src", "Quizymode.Web", "src", "features", "legal", "policyAcceptanceStorage.ts"));

        ReadConstant(source, "TERMS_OF_SERVICE_POLICY_VERSION").Should().Be(CurrentPolicyVersions.TermsOfService);
        ReadConstant(source, "PRIVACY_POLICY_VERSION").Should().Be(CurrentPolicyVersions.PrivacyPolicy);
    }

    private static string ReadConstant(string source, string name)
    {
        System.Text.RegularExpressions.Match match = Regex.Match(source, $@"export const {name} = ""([^""]+)""");
        match.Success.Should().BeTrue($"{name} should be declared in policyAcceptanceStorage.ts");
        return match.Groups[1].Value;
    }

    private static string FindRepoRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Directory.Build.props")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("Repository root not found.");
    }
}
