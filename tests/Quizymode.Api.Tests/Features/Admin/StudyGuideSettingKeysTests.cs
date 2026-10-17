using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.UserSettings;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>AC 5.1: StudyGuidePremium / StudyGuideDailySections / StudyGuideMonthlySections are admin-only and validated.</summary>
public sealed class StudyGuideSettingKeysTests : DatabaseTestFixture
{
    [Theory]
    [InlineData("StudyGuidePremium", "true", true)]
    [InlineData("StudyGuidePremium", "false", true)]
    [InlineData("StudyGuidePremium", "", true)]
    [InlineData("StudyGuidePremium", "yes", false)]
    [InlineData("StudyGuideDailySections", "0", true)]
    [InlineData("StudyGuideDailySections", "100000", true)]
    [InlineData("StudyGuideDailySections", "100001", false)]
    [InlineData("StudyGuideDailySections", "-1", false)]
    [InlineData("StudyGuideMonthlySections", "12.5", false)]
    [InlineData("StudyGuideMonthlySections", "", true)]
    [InlineData("studyguidemonthlysections", "abc", false)]
    [InlineData("StudyGuideMaxBytes", "anything", true)]
    public void AdminValidator_ValidatesStudyGuideKeys(string key, string value, bool valid)
    {
        new AdminUserSettings.UpdateValidator().Validate(new AdminUserSettings.UpdateRequest(key, value)).IsValid.Should().Be(valid);
    }

    [Fact]
    public async Task AdminUpdate_StoresCanonicalKeyCasingAndTrimmedValue()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-1" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await AdminUserSettings.HandleUpdateAsync(
            user.Id.ToString(),
            new AdminUserSettings.UpdateRequest("studyguidepremium", " true "),
            DbContext,
            CancellationToken.None);

        result.Value.Key.Should().Be("StudyGuidePremium");
        DbContext.UserSettings.Should().ContainSingle(s => s.Key == "StudyGuidePremium" && s.Value == "true");
    }

    [Theory]
    [InlineData("StudyGuidePremium")]
    [InlineData("studyguidepremium")]
    [InlineData("StudyGuideDailySections")]
    [InlineData("StudyGuideMonthlySections")]
    public void UserSelfUpdate_RejectsAdminOnlyKeys(string key)
    {
        var validation = new UpdateUserSetting.Validator().Validate(new UpdateUserSetting.Request(key, "true"));

        validation.IsValid.Should().BeFalse();
        validation.Errors.Should().Contain(error => error.ErrorMessage == "This setting can only be changed by an admin.");
    }

    [Fact]
    public void UserSelfUpdate_StillAllowsOtherKeys()
    {
        new UpdateUserSetting.Validator().Validate(new UpdateUserSetting.Request("StudyGuideMaxBytes", "100000")).IsValid.Should().BeTrue();
    }
}
