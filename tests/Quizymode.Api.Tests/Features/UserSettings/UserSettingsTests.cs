using FluentAssertions;
using Moq;
using Quizymode.Api.Features.UserSettings;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.UserSettings;

public sealed class GetUserSettingsTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(Guid userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId.ToString());
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_ReturnsEmptyDictionary_WhenUserHasNoSettings()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new Quizymode.Api.Shared.Models.User
        {
            Id = userId, Subject = "sub-gs1", Email = "gs1@example.com"
        });
        await DbContext.SaveChangesAsync();

        var result = await GetUserSettings.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Settings.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ReturnsSettings_WhenUserHasSettings()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new Quizymode.Api.Shared.Models.User
        {
            Id = userId, Subject = "sub-gs2", Email = "gs2@example.com"
        });
        DbContext.UserSettings.AddRange(
            new UserSetting { Id = Guid.NewGuid(), UserId = userId, Key = "Theme", Value = "dark", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new UserSetting { Id = Guid.NewGuid(), UserId = userId, Key = "PageSize", Value = "20", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );
        await DbContext.SaveChangesAsync();

        var result = await GetUserSettings.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Settings.Should().HaveCount(2);
        result.Value.Settings["Theme"].Should().Be("dark");
        result.Value.Settings["PageSize"].Should().Be("20");
    }

    [Fact]
    public async Task HandleAsync_OnlyReturnsSettingsForCurrentUser()
    {
        Guid userId = Guid.NewGuid();
        Guid otherId = Guid.NewGuid();
        DbContext.Users.AddRange(
            new Quizymode.Api.Shared.Models.User { Id = userId, Subject = "sub-gs3", Email = "gs3@example.com" },
            new Quizymode.Api.Shared.Models.User { Id = otherId, Subject = "sub-gs4", Email = "gs4@example.com" }
        );
        DbContext.UserSettings.AddRange(
            new UserSetting { Id = Guid.NewGuid(), UserId = userId, Key = "MyKey", Value = "MyVal", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new UserSetting { Id = Guid.NewGuid(), UserId = otherId, Key = "OtherKey", Value = "OtherVal", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        );
        await DbContext.SaveChangesAsync();

        var result = await GetUserSettings.HandleAsync(DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Settings.Should().ContainKey("MyKey");
        result.Value.Settings.Should().NotContainKey("OtherKey");
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenUserIdIsInvalidGuid()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns("invalid-guid");

        var result = await GetUserSettings.HandleAsync(DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("UserSettings.InvalidUserId");
    }
}

public sealed class UpdateUserSettingTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(Guid userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId.ToString());
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_CreatesNewSetting_WhenKeyDoesNotExist()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new Quizymode.Api.Shared.Models.User
        {
            Id = userId, Subject = "sub-us1", Email = "us1@example.com"
        });
        await DbContext.SaveChangesAsync();

        var result = await UpdateUserSetting.HandleAsync(
            new UpdateUserSetting.Request("Theme", "dark"),
            DbContext,
            AuthenticatedUser(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Key.Should().Be("Theme");
        result.Value.Value.Should().Be("dark");
        DbContext.UserSettings.Should().ContainSingle(s => s.Key == "Theme" && s.Value == "dark");
    }

    [Fact]
    public async Task HandleAsync_UpdatesExistingSetting_WhenKeyAlreadyExists()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new Quizymode.Api.Shared.Models.User
        {
            Id = userId, Subject = "sub-us2", Email = "us2@example.com"
        });
        DbContext.UserSettings.Add(new UserSetting
        {
            Id = Guid.NewGuid(), UserId = userId, Key = "Theme", Value = "light",
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await UpdateUserSetting.HandleAsync(
            new UpdateUserSetting.Request("Theme", "dark"),
            DbContext,
            AuthenticatedUser(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Value.Should().Be("dark");
        DbContext.UserSettings.Should().ContainSingle(s => s.Key == "Theme" && s.Value == "dark");
    }

    [Fact]
    public async Task HandleAsync_IsIdempotent_WhenSameValueSubmittedTwice()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new Quizymode.Api.Shared.Models.User
        {
            Id = userId, Subject = "sub-us3", Email = "us3@example.com"
        });
        await DbContext.SaveChangesAsync();

        await UpdateUserSetting.HandleAsync(
            new UpdateUserSetting.Request("PageSize", "10"),
            DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        var result = await UpdateUserSetting.HandleAsync(
            new UpdateUserSetting.Request("PageSize", "10"),
            DbContext, AuthenticatedUser(userId).Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.UserSettings.Should().ContainSingle(s => s.Key == "PageSize");
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenUserIdIsInvalidGuid()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns("bad-id");

        var result = await UpdateUserSetting.HandleAsync(
            new UpdateUserSetting.Request("Key", "Value"),
            DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("UserSettings.InvalidUserId");
    }
}

public sealed class UpdateUserSettingValidatorTests
{
    private readonly UpdateUserSetting.Validator _validator = new();

    [Fact]
    public async Task Validate_Passes_ForValidRequest()
    {
        var result = await _validator.ValidateAsync(new UpdateUserSetting.Request("Theme", "dark"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_Fails_ForEmptyKey()
    {
        var result = await _validator.ValidateAsync(new UpdateUserSetting.Request("", "value"));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_Fails_ForKeyExceeding100Chars()
    {
        var result = await _validator.ValidateAsync(new UpdateUserSetting.Request(new string('k', 101), "value"));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_Fails_ForValueExceeding500Chars()
    {
        var result = await _validator.ValidateAsync(new UpdateUserSetting.Request("Key", new string('v', 501)));
        result.IsValid.Should().BeFalse();
    }
}
