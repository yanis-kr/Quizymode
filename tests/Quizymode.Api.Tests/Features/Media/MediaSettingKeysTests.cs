using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.UserSettings;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Media;

/// <summary>AC 3.28.7: picture quota overrides are admin-only, bounded, canonicalized.</summary>
public sealed class MediaSettingKeysTests : DatabaseTestFixture
{
    [Theory]
    [InlineData("MediaUploadsPerHour", "0", true)]
    [InlineData("MediaUploadsPerHour", "200", true)]
    [InlineData("MediaUploadsPerDay", "201", false)]
    [InlineData("MediaPendingReviewItems", "-1", false)]
    [InlineData("MediaRetainedBytes", "209715200", true)]
    [InlineData("MediaRetainedBytes", "209715201", false)]
    [InlineData("MediaAdvisoryOwnerDailyCalls", "100", true)]
    [InlineData("MediaAdvisoryOwnerDailyCalls", "101", false)]
    [InlineData("MediaUploadsPerDay", "", true)]
    [InlineData("mediauploadsperday", "abc", false)]
    public void AdminValidator_ValidatesMediaKeys(string key, string value, bool valid)
    {
        new AdminUserSettings.UpdateValidator().Validate(new AdminUserSettings.UpdateRequest(key, value)).IsValid.Should().Be(valid);
    }

    [Theory]
    [InlineData("MediaUploadsPerHour")]
    [InlineData("MediaUploadsPerDay")]
    [InlineData("MediaPendingReviewItems")]
    [InlineData("MediaRetainedBytes")]
    [InlineData("MediaAdvisoryOwnerDailyCalls")]
    [InlineData("mediauploadsperday")]
    public void UserCannotSetMediaOverrideKeys(string key)
    {
        var validation = new UpdateUserSetting.Validator().Validate(new UpdateUserSetting.Request(key, "200"));

        validation.IsValid.Should().BeFalse();
        validation.Errors.Should().Contain(error => error.ErrorMessage == "This setting can only be changed by an admin.");
    }

    [Theory]
    [InlineData("MediaUploadsPerDay")]
    [InlineData("mediauploadsperday")]
    public async Task UserSettingsPut_RefusesMediaOverrideKeyWith400AndWritesNothing(string key)
    {
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => services.AddScoped<IValidator<UpdateUserSetting.Request>, UpdateUserSetting.Validator>(),
            app => new UpdateUserSetting.Endpoint().MapEndpoint(app));
        string token = host.CreateToken("fixture-media-user", "media-user@example.test");

        using HttpResponseMessage response = await host.Client.SendAsync(
            JwtHttpTestHost.Request(HttpMethod.Put, "/users/settings", token, JsonContent.Create(new { key, value = "200" })));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().Contain("This setting can only be changed by an admin.");
        await using ApplicationDbContext verify = CreateDbContext();
        (await verify.UserSettings.AsNoTracking().Where(s => s.Key.ToLower() == "mediauploadsperday").CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task AdminUpdate_StoresCanonicalMediaKeyAndTrimmedValue()
    {
        User user = new() { Id = Guid.NewGuid(), Subject = "sub-media" };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        var result = await AdminUserSettings.HandleUpdateAsync(
            user.Id.ToString(),
            new AdminUserSettings.UpdateRequest("mediauploadsperday", " 5 "),
            DbContext,
            CancellationToken.None);

        result.Value.Key.Should().Be("MediaUploadsPerDay");
        DbContext.UserSettings.Should().ContainSingle(s => s.Key == "MediaUploadsPerDay" && s.Value == "5");
    }
}
