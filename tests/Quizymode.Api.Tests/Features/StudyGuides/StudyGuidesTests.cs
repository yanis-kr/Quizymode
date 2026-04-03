using FluentAssertions;
using Moq;
using Quizymode.Api.Features.StudyGuides;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuides;

public sealed class GetCurrentStudyGuideTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_ReturnsGuide_WhenUserHasOne()
    {
        string userId = Guid.NewGuid().ToString();
        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = "My Notes",
            ContentText = "Some text",
            SizeBytes = 9,
            CreatedUtc = DateTime.UtcNow,
            UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        DbContext.StudyGuides.Add(guide);
        await DbContext.SaveChangesAsync();

        var result = await GetCurrentStudyGuide.HandleAsync(DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.Title.Should().Be("My Notes");
        result.Value.ContentText.Should().Be("Some text");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNull_WhenUserHasNoGuide()
    {
        var result = await GetCurrentStudyGuide.HandleAsync(DbContext, Guid.NewGuid().ToString(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_OnlyReturnsGuideBelongingToUser()
    {
        string userId = Guid.NewGuid().ToString();
        string otherId = Guid.NewGuid().ToString();
        DbContext.StudyGuides.Add(new StudyGuide
        {
            Id = Guid.NewGuid(), UserId = otherId, Title = "Other", ContentText = "",
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow, ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        });
        await DbContext.SaveChangesAsync();

        var result = await GetCurrentStudyGuide.HandleAsync(DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }
}

public sealed class UpsertCurrentStudyGuideTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_CreatesGuide_WhenNoneExists()
    {
        string userId = Guid.NewGuid().ToString("N").Insert(8, "-").Insert(13, "-").Insert(18, "-").Insert(23, "-");
        var request = new UpsertCurrentStudyGuide.Request("Test Title", "Hello world content");

        var result = await UpsertCurrentStudyGuide.HandleAsync(request, DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Title.Should().Be("Test Title");
        DbContext.StudyGuides.Should().ContainSingle(g => g.UserId == userId);
    }

    [Fact]
    public async Task HandleAsync_UpdatesGuide_WhenOneAlreadyExists()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.StudyGuides.Add(new StudyGuide
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "Old Title", ContentText = "old",
            SizeBytes = 3, CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        });
        await DbContext.SaveChangesAsync();

        var result = await UpsertCurrentStudyGuide.HandleAsync(
            new UpsertCurrentStudyGuide.Request("New Title", "new content"),
            DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Title.Should().Be("New Title");
        DbContext.StudyGuides.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenContentExceedsDefaultLimit()
    {
        string userId = Guid.NewGuid().ToString();
        string bigContent = new string('a', 52_000); // > 50 KB default

        var result = await UpsertCurrentStudyGuide.HandleAsync(
            new UpsertCurrentStudyGuide.Request("Title", bigContent),
            DbContext, userId, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("StudyGuide.SizeExceeded");
    }

    [Fact]
    public async Task HandleAsync_RespectsPerUserMaxBytesSetting()
    {
        Guid userGuid = Guid.NewGuid();
        string userId = userGuid.ToString();

        // Create user first (UserSetting has a FK to User)
        DbContext.Users.Add(new Quizymode.Api.Shared.Models.User
        {
            Id = userGuid, Subject = "sub-sg-limit", Email = "limit@example.com"
        });
        // Give user a higher limit via settings
        DbContext.UserSettings.Add(new UserSetting
        {
            Id = Guid.NewGuid(), UserId = userGuid, Key = "StudyGuideMaxBytes",
            Value = "200000", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        string content = new string('a', 60_000); // > 50 KB default but < 200 KB override

        var result = await UpsertCurrentStudyGuide.HandleAsync(
            new UpsertCurrentStudyGuide.Request("Title", content),
            DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenUserIdIsInvalidGuid()
    {
        var result = await UpsertCurrentStudyGuide.HandleAsync(
            new UpsertCurrentStudyGuide.Request("Title", "content"),
            DbContext, "not-a-guid", CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("StudyGuide.InvalidUserId");
    }
}

public sealed class UpsertCurrentStudyGuideValidatorTests
{
    private readonly UpsertCurrentStudyGuide.Validator _validator = new();

    [Fact]
    public async Task Validate_Passes_ForValidRequest()
    {
        var result = await _validator.ValidateAsync(new UpsertCurrentStudyGuide.Request("Title", "Content"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_Fails_ForEmptyTitle()
    {
        var result = await _validator.ValidateAsync(new UpsertCurrentStudyGuide.Request("", "Content"));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_Fails_ForTitleExceeding200Chars()
    {
        var result = await _validator.ValidateAsync(new UpsertCurrentStudyGuide.Request(new string('x', 201), "Content"));
        result.IsValid.Should().BeFalse();
    }
}

public sealed class DeleteCurrentStudyGuideTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_DeletesGuide_WhenExists()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.StudyGuides.Add(new StudyGuide
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "To Delete", ContentText = "",
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        });
        await DbContext.SaveChangesAsync();

        var result = await DeleteCurrentStudyGuide.HandleAsync(DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        DbContext.StudyGuides.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_Succeeds_WhenNoGuideExists()
    {
        var result = await DeleteCurrentStudyGuide.HandleAsync(DbContext, Guid.NewGuid().ToString(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_OnlyDeletesGuideForSpecificUser()
    {
        string userId = Guid.NewGuid().ToString();
        string otherId = Guid.NewGuid().ToString();
        DbContext.StudyGuides.Add(new StudyGuide
        {
            Id = Guid.NewGuid(), UserId = otherId, Title = "Other User", ContentText = "",
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        });
        await DbContext.SaveChangesAsync();

        await DeleteCurrentStudyGuide.HandleAsync(DbContext, userId, CancellationToken.None);

        DbContext.StudyGuides.Should().ContainSingle();
    }
}
