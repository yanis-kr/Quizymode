using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class AdminUserSettingsTests : DatabaseTestFixture
{
    private async Task<User> CreateUserAsync()
    {
        User user = new()
        {
            Id = Guid.NewGuid(),
            Subject = $"sub-{Guid.NewGuid()}",
            Email = $"{Guid.NewGuid()}@example.com"
        };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();
        return user;
    }

    // --- HandleGetAsync ---

    [Fact]
    public async Task HandleGetAsync_InvalidGuid_ReturnsValidationError()
    {
        var result = await AdminUserSettings.HandleGetAsync("not-a-guid", DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.InvalidUserId");
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task HandleGetAsync_UserNotFound_ReturnsNotFound()
    {
        var result = await AdminUserSettings.HandleGetAsync(Guid.NewGuid().ToString(), DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.UserNotFound");
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleGetAsync_UserWithNoSettings_ReturnsEmptyDict()
    {
        User user = await CreateUserAsync();

        var result = await AdminUserSettings.HandleGetAsync(user.Id.ToString(), DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Settings.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleGetAsync_UserWithSettings_ReturnsDictionary()
    {
        User user = await CreateUserAsync();
        DbContext.UserSettings.Add(new UserSetting { Id = Guid.NewGuid(), UserId = user.Id, Key = "theme", Value = "dark" });
        DbContext.UserSettings.Add(new UserSetting { Id = Guid.NewGuid(), UserId = user.Id, Key = "pageSize", Value = "20" });
        await DbContext.SaveChangesAsync();

        var result = await AdminUserSettings.HandleGetAsync(user.Id.ToString(), DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Settings.Should().HaveCount(2);
        result.Value.Settings["theme"].Should().Be("dark");
        result.Value.Settings["pageSize"].Should().Be("20");
    }

    // --- HandleUpdateAsync ---

    [Fact]
    public async Task HandleUpdateAsync_InvalidGuid_ReturnsValidationError()
    {
        var request = new AdminUserSettings.UpdateRequest("key", "value");

        var result = await AdminUserSettings.HandleUpdateAsync("bad-id", request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.InvalidUserId");
    }

    [Fact]
    public async Task HandleUpdateAsync_UserNotFound_ReturnsNotFound()
    {
        var request = new AdminUserSettings.UpdateRequest("key", "value");

        var result = await AdminUserSettings.HandleUpdateAsync(Guid.NewGuid().ToString(), request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.UserNotFound");
    }

    [Fact]
    public async Task HandleUpdateAsync_NewKey_CreatesSetting()
    {
        User user = await CreateUserAsync();
        var request = new AdminUserSettings.UpdateRequest("theme", "dark");

        var result = await AdminUserSettings.HandleUpdateAsync(user.Id.ToString(), request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Key.Should().Be("theme");
        result.Value.Value.Should().Be("dark");
        DbContext.UserSettings.Should().ContainSingle(s => s.UserId == user.Id && s.Key == "theme" && s.Value == "dark");
    }

    [Fact]
    public async Task HandleUpdateAsync_ExistingKey_UpdatesSetting()
    {
        User user = await CreateUserAsync();
        var createRequest = new AdminUserSettings.UpdateRequest("theme", "light");
        await AdminUserSettings.HandleUpdateAsync(user.Id.ToString(), createRequest, DbContext, CancellationToken.None);

        var updateRequest = new AdminUserSettings.UpdateRequest("theme", "dark");
        var result = await AdminUserSettings.HandleUpdateAsync(user.Id.ToString(), updateRequest, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Value.Should().Be("dark");
        DbContext.UserSettings.Count(s => s.UserId == user.Id && s.Key == "theme").Should().Be(1);
    }

    // --- UpdateValidator ---

    [Fact]
    public async Task UpdateValidator_ValidRequest_Passes()
    {
        var validator = new AdminUserSettings.UpdateValidator();
        var result = await validator.ValidateAsync(new AdminUserSettings.UpdateRequest("theme", "dark"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateValidator_EmptyKey_Fails()
    {
        var validator = new AdminUserSettings.UpdateValidator();
        var result = await validator.ValidateAsync(new AdminUserSettings.UpdateRequest("", "value"));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Key");
    }

    [Fact]
    public async Task UpdateValidator_KeyTooLong_Fails()
    {
        var validator = new AdminUserSettings.UpdateValidator();
        var result = await validator.ValidateAsync(new AdminUserSettings.UpdateRequest(new string('k', 101), "value"));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateValidator_ValueTooLong_Fails()
    {
        var validator = new AdminUserSettings.UpdateValidator();
        var result = await validator.ValidateAsync(new AdminUserSettings.UpdateRequest("key", new string('v', 501)));
        result.IsValid.Should().BeFalse();
    }
}
