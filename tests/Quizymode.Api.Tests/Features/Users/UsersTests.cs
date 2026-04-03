using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.Users;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Users;

public sealed class GetCurrentUserTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(Guid userId, bool isAdmin = false)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId.ToString());
        ctx.SetupGet(x => x.IsAdmin).Returns(isAdmin);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_ReturnsUser_WhenUserExists()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-1", Name = "Alice", Email = "alice@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await GetCurrentUser.HandleAsync(DbContext, AuthenticatedUser(user.Id).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(user.Id.ToString());
        result.Value.Name.Should().Be("Alice");
        result.Value.Email.Should().Be("alice@example.com");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenUserDoesNotExist()
    {
        var result = await GetCurrentUser.HandleAsync(DbContext, AuthenticatedUser(Guid.NewGuid()).Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("User.NotFound");
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenUserIdIsInvalidGuid()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns("not-a-guid");

        var result = await GetCurrentUser.HandleAsync(DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("User.InvalidUserId");
    }

    [Fact]
    public async Task HandleAsync_IncludesIsAdmin_FromUserContext()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-admin", Email = "admin@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await GetCurrentUser.HandleAsync(DbContext, AuthenticatedUser(user.Id, isAdmin: true).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.IsAdmin.Should().BeTrue();
    }
}

public sealed class GetUserByIdTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_ReturnsUser_WhenUserExists()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-2", Name = "Bob", Email = "bob@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await GetUserById.HandleAsync(user.Id.ToString(), DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(user.Id.ToString());
        result.Value.Name.Should().Be("Bob");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenUserDoesNotExist()
    {
        var result = await GetUserById.HandleAsync(Guid.NewGuid().ToString(), DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("User.NotFound");
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenIdIsNotGuid()
    {
        var result = await GetUserById.HandleAsync("bad-id", DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("User.InvalidId");
    }
}

public sealed class UpdateUserNameTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(Guid userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId.ToString());
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_UpdatesName_WhenValid()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-u1", Name = "OldName", Email = "u@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await UpdateUserName.HandleAsync(
            new UpdateUserName.Request("NewName"),
            DbContext,
            AuthenticatedUser(user.Id).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("NewName");

        User? stored = await DbContext.Users.FindAsync(user.Id);
        stored!.Name.Should().Be("NewName");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenUserDoesNotExist()
    {
        var result = await UpdateUserName.HandleAsync(
            new UpdateUserName.Request("Name"),
            DbContext,
            AuthenticatedUser(Guid.NewGuid()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("User.NotFound");
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenNameIsTakenByAnotherUser()
    {
        User other = new() { Id = Guid.NewGuid(), Subject = "sub-o", Name = "TakenUser", Email = "other@example.com" };
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-u2", Name = "MyName", Email = "me@example.com" };
        DbContext.Users.AddRange(other, user);
        await DbContext.SaveChangesAsync();

        var result = await UpdateUserName.HandleAsync(
            new UpdateUserName.Request("TakenUser"),
            DbContext,
            AuthenticatedUser(user.Id).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("User.NameAlreadyTaken");
    }

    [Fact]
    public async Task HandleAsync_AllowsSameName_WhenUserUpdatesToOwnCurrentName()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-u3", Name = "MySameName", Email = "same@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await UpdateUserName.HandleAsync(
            new UpdateUserName.Request("MySameName"),
            DbContext,
            AuthenticatedUser(user.Id).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }
}

public sealed class UpdateUserNameValidatorTests
{
    private readonly UpdateUserName.Validator _validator = new();

    [Fact]
    public async Task Validate_PassesForValidName()
    {
        var result = await _validator.ValidateAsync(new UpdateUserName.Request("ValidName"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_FailsForEmptyName()
    {
        var result = await _validator.ValidateAsync(new UpdateUserName.Request(""));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_FailsForNameExceeding200Characters()
    {
        var result = await _validator.ValidateAsync(new UpdateUserName.Request(new string('a', 201)));
        result.IsValid.Should().BeFalse();
    }
}

public sealed class CheckUserAvailabilityTests : DatabaseTestFixture
{
    /// <summary>Replicates the availability check logic from the handler.</summary>
    private async Task<(bool isUsernameAvailable, bool isEmailAvailable)> CheckAsync(string? username, string? email)
    {
        bool isUsernameAvailable = true;
        bool isEmailAvailable = true;

        if (!string.IsNullOrWhiteSpace(username))
        {
            isUsernameAvailable = !await DbContext.Users
                .AnyAsync(u => u.Name != null && u.Name.ToLower() == username.Trim().ToLower());
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            isEmailAvailable = !await DbContext.Users
                .AnyAsync(u => u.Email != null && u.Email.ToLower() == email.Trim().ToLower());
        }

        return (isUsernameAvailable, isEmailAvailable);
    }

    [Fact]
    public async Task BothAvailable_WhenNeitherExistsInDb()
    {
        var (usernameAvailable, emailAvailable) = await CheckAsync("newuser", "new@example.com");
        usernameAvailable.Should().BeTrue();
        emailAvailable.Should().BeTrue();
    }

    [Fact]
    public async Task UsernameUnavailable_WhenExistingUserHasThatName()
    {
        DbContext.Users.Add(new User { Id = Guid.NewGuid(), Subject = "s1", Name = "TakenName", Email = "t@example.com" });
        await DbContext.SaveChangesAsync();

        var (usernameAvailable, _) = await CheckAsync("TakenName", null);
        usernameAvailable.Should().BeFalse();
    }

    [Fact]
    public async Task EmailUnavailable_WhenExistingUserHasThatEmail()
    {
        DbContext.Users.Add(new User { Id = Guid.NewGuid(), Subject = "s2", Email = "taken@example.com" });
        await DbContext.SaveChangesAsync();

        var (_, emailAvailable) = await CheckAsync(null, "TAKEN@example.com");
        emailAvailable.Should().BeFalse();
    }

    [Fact]
    public async Task CaseInsensitive_WhenCheckingUsername()
    {
        DbContext.Users.Add(new User { Id = Guid.NewGuid(), Subject = "s3", Name = "CaseUser", Email = "case@example.com" });
        await DbContext.SaveChangesAsync();

        var (usernameAvailable, _) = await CheckAsync("CASEUSER", null);
        usernameAvailable.Should().BeFalse();
    }
}

public sealed class RecordPolicyAcceptancesValidatorTests
{
    private readonly RecordPolicyAcceptances.Validator _validator = new();

    [Fact]
    public async Task Validate_PassesForValidRequest()
    {
        var request = new RecordPolicyAcceptances.Request(
        [
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow),
            new RecordPolicyAcceptances.PolicyAcceptanceItem("PrivacyPolicy", "1.0", DateTime.UtcNow)
        ]);

        var result = await _validator.ValidateAsync(request);
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_FailsWhenAcceptancesEmpty()
    {
        var result = await _validator.ValidateAsync(new RecordPolicyAcceptances.Request([]));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_FailsForUnsupportedPolicyType()
    {
        var request = new RecordPolicyAcceptances.Request(
        [
            new RecordPolicyAcceptances.PolicyAcceptanceItem("UnknownPolicy", "1.0", DateTime.UtcNow)
        ]);
        var result = await _validator.ValidateAsync(request);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_FailsForDuplicatePolicyTypeAndVersion()
    {
        var request = new RecordPolicyAcceptances.Request(
        [
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow),
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow)
        ]);
        var result = await _validator.ValidateAsync(request);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_PassesTwoDifferentVersionsOfSamePolicyType()
    {
        var request = new RecordPolicyAcceptances.Request(
        [
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow),
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "2.0", DateTime.UtcNow)
        ]);
        var result = await _validator.ValidateAsync(request);
        result.IsValid.Should().BeTrue();
    }
}

public sealed class RecordPolicyAcceptancesTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(Guid userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId.ToString());
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_InsertsNewAcceptances()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-p1", Email = "p@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var httpCtx = new DefaultHttpContext();
        var request = new RecordPolicyAcceptances.Request(
        [
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow),
            new RecordPolicyAcceptances.PolicyAcceptanceItem("PrivacyPolicy", "1.0", DateTime.UtcNow)
        ]);

        var result = await RecordPolicyAcceptances.HandleAsync(
            request, DbContext, AuthenticatedUser(user.Id).Object, httpCtx, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Acceptances.Should().HaveCount(2);
        DbContext.UserPolicyAcceptances.Should().HaveCount(2);
    }

    [Fact]
    public async Task HandleAsync_IsIdempotent_WhenSameAcceptanceSubmittedTwice()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-p2", Email = "p2@example.com" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var httpCtx = new DefaultHttpContext();
        var request = new RecordPolicyAcceptances.Request(
        [
            new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow)
        ]);

        await RecordPolicyAcceptances.HandleAsync(
            request, DbContext, AuthenticatedUser(user.Id).Object, httpCtx, CancellationToken.None);
        var result = await RecordPolicyAcceptances.HandleAsync(
            request, DbContext, AuthenticatedUser(user.Id).Object, httpCtx, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.UserPolicyAcceptances.Should().HaveCount(1);
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenUserIdIsInvalidGuid()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns("not-a-guid");

        var result = await RecordPolicyAcceptances.HandleAsync(
            new RecordPolicyAcceptances.Request(
            [
                new RecordPolicyAcceptances.PolicyAcceptanceItem("TermsOfService", "1.0", DateTime.UtcNow)
            ]),
            DbContext, ctx.Object, new DefaultHttpContext(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Users.PolicyAcceptance.InvalidUserId");
    }
}
