using System.Text.Json;
using FluentAssertions;
using Moq;
using Quizymode.Api.Features.StudyGuideImport;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideImport;

public sealed class CreateImportSessionTests : DatabaseTestFixture
{
    private static StudyGuide CreateGuide(string userId) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Title = "My Study Guide",
        ContentText = "Some content",
        SizeBytes = 12,
        CreatedUtc = DateTime.UtcNow,
        UpdatedUtc = DateTime.UtcNow,
        ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
    };

    [Fact]
    public async Task HandleAsync_CreatesSession_WhenStudyGuideExists()
    {
        string userId = Guid.NewGuid().ToString();
        StudyGuide guide = CreateGuide(userId);
        DbContext.StudyGuides.Add(guide);
        await DbContext.SaveChangesAsync();

        var request = new CreateImportSession.Request(
            "exams",
            new[] { "aws", "saa-c03" },
            null,
            3);

        var result = await CreateImportSession.HandleAsync(request, DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.StudyGuideTitle.Should().Be("My Study Guide");
        DbContext.StudyGuideImportSessions.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenNoStudyGuide()
    {
        string userId = Guid.NewGuid().ToString();

        var request = new CreateImportSession.Request(
            "exams",
            new[] { "aws", "saa-c03" });

        var result = await CreateImportSession.HandleAsync(request, DbContext, userId, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("StudyGuide.NotFound");
    }

    [Fact]
    public async Task HandleAsync_StoresNavigationKeywordPath_AsJson()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.StudyGuides.Add(CreateGuide(userId));
        await DbContext.SaveChangesAsync();

        var nav = new[] { "aws", "saa-c03" };
        await CreateImportSession.HandleAsync(
            new CreateImportSession.Request("exams", nav), DbContext, userId, CancellationToken.None);

        var session = DbContext.StudyGuideImportSessions.Single();
        var stored = JsonSerializer.Deserialize<List<string>>(session.NavigationKeywordPathJson);
        stored.Should().BeEquivalentTo(nav);
    }

    [Fact]
    public async Task HandleAsync_StoresDefaultKeywords_WhenProvided()
    {
        string userId = Guid.NewGuid().ToString();
        DbContext.StudyGuides.Add(CreateGuide(userId));
        await DbContext.SaveChangesAsync();

        var defaults = new[] { "ec2", "s3" };
        await CreateImportSession.HandleAsync(
            new CreateImportSession.Request("exams", new[] { "aws", "saa-c03" }, defaults),
            DbContext, userId, CancellationToken.None);

        var session = DbContext.StudyGuideImportSessions.Single();
        session.DefaultKeywordsJson.Should().NotBeNullOrEmpty();
        var stored = JsonSerializer.Deserialize<List<string>>(session.DefaultKeywordsJson!);
        stored.Should().BeEquivalentTo(defaults);
    }
}

public sealed class CreateImportSessionValidatorTests
{
    private readonly CreateImportSession.Validator _validator = new();

    [Fact]
    public async Task Validate_Passes_ForValidRequest()
    {
        var result = await _validator.ValidateAsync(
            new CreateImportSession.Request("exams", new[] { "aws", "saa-c03" }, null, 3));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_Fails_WhenCategoryNameIsEmpty()
    {
        var result = await _validator.ValidateAsync(
            new CreateImportSession.Request("", new[] { "aws", "saa-c03" }));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_Fails_WhenTargetSetCountOutOfRange()
    {
        var result = await _validator.ValidateAsync(
            new CreateImportSession.Request("exams", new[] { "aws", "saa-c03" }, null, 10));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_Passes_ForTargetSetCountAtBoundary()
    {
        var result = await _validator.ValidateAsync(
            new CreateImportSession.Request("exams", new[] { "aws", "saa-c03" }, null, 6));
        result.IsValid.Should().BeTrue();
    }
}

public sealed class GetImportSessionTests : DatabaseTestFixture
{
    private (StudyGuide guide, StudyGuideImportSession session) CreateSessionData(string userId)
    {
        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "Guide", ContentText = "content",
            SizeBytes = 7, CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = userId,
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\",\"saa-c03\"]",
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.Draft,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        return (guide, session);
    }

    [Fact]
    public async Task HandleAsync_ReturnsSession_WhenFound()
    {
        string userId = Guid.NewGuid().ToString();
        var (guide, session) = CreateSessionData(userId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        var result = await GetImportSession.HandleAsync(
            session.Id.ToString(), DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value!.CategoryName.Should().Be("exams");
        result.Value.NavigationKeywordPath.Should().BeEquivalentTo(new[] { "aws", "saa-c03" });
    }

    [Fact]
    public async Task HandleAsync_ReturnsNull_WhenSessionBelongsToOtherUser()
    {
        string userId = Guid.NewGuid().ToString();
        string otherId = Guid.NewGuid().ToString();
        var (guide, session) = CreateSessionData(otherId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        var result = await GetImportSession.HandleAsync(
            session.Id.ToString(), DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ReturnsNull_WhenIdIsNotGuid()
    {
        var result = await GetImportSession.HandleAsync(
            "not-a-guid", DbContext, Guid.NewGuid().ToString(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_IncludesChunks_WhenPresent()
    {
        string userId = Guid.NewGuid().ToString();
        var (guide, session) = CreateSessionData(userId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        DbContext.StudyGuideChunks.Add(new StudyGuideChunk
        {
            Id = Guid.NewGuid(), ImportSessionId = session.Id, ChunkIndex = 0,
            Title = "Chunk 1", ChunkText = "text", SizeBytes = 4,
            PromptText = "prompt", CreatedUtc = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        var result = await GetImportSession.HandleAsync(
            session.Id.ToString(), DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Chunks.Should().ContainSingle();
    }
}

public sealed class SubmitChunkResultTests : DatabaseTestFixture
{
    private (StudyGuide guide, StudyGuideImportSession session, StudyGuideChunk chunk) CreateTestData(string userId)
    {
        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "Guide", ContentText = "content",
            SizeBytes = 7, CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = userId,
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\",\"saa-c03\"]",
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.ChunksGenerated,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        StudyGuideChunk chunk = new()
        {
            Id = Guid.NewGuid(), ImportSessionId = session.Id, ChunkIndex = 0,
            Title = "Part 1", ChunkText = "some text", SizeBytes = 9,
            PromptText = "prompt", CreatedUtc = DateTime.UtcNow
        };
        return (guide, session, chunk);
    }

    [Fact]
    public async Task HandleAsync_ReturnsInvalid_WhenJsonIsNotArray()
    {
        string userId = Guid.NewGuid().ToString();
        var (guide, session, chunk) = CreateTestData(userId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        DbContext.StudyGuideChunks.Add(chunk);
        await DbContext.SaveChangesAsync();

        var result = await SubmitChunkResult.HandleAsync(
            session.Id.ToString(), 0, "{\"not\":\"array\"}", DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.ValidationStatus.Should().Be("Invalid");
    }

    [Fact]
    public async Task HandleAsync_ReturnsInvalid_WhenJsonIsMalformed()
    {
        string userId = Guid.NewGuid().ToString();
        var (guide, session, chunk) = CreateTestData(userId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        DbContext.StudyGuideChunks.Add(chunk);
        await DbContext.SaveChangesAsync();

        var result = await SubmitChunkResult.HandleAsync(
            session.Id.ToString(), 0, "not json at all", DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.ValidationStatus.Should().Be("Invalid");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNull_WhenSessionBelongsToOtherUser()
    {
        string userId = Guid.NewGuid().ToString();
        string otherId = Guid.NewGuid().ToString();
        var (guide, session, chunk) = CreateTestData(otherId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        DbContext.StudyGuideChunks.Add(chunk);
        await DbContext.SaveChangesAsync();

        var result = await SubmitChunkResult.HandleAsync(
            session.Id.ToString(), 0, "[]", DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }
}

public sealed class SubmitDedupResultTests : DatabaseTestFixture
{
    private (StudyGuide guide, StudyGuideImportSession session) CreateSessionData(string userId)
    {
        StudyGuide guide = new()
        {
            Id = Guid.NewGuid(), UserId = userId, Title = "Guide", ContentText = "content",
            SizeBytes = 7, CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(14)
        };
        StudyGuideImportSession session = new()
        {
            Id = Guid.NewGuid(), StudyGuideId = guide.Id, UserId = userId,
            CategoryName = "exams", NavigationKeywordPathJson = "[\"aws\",\"saa-c03\"]",
            TargetItemsPerChunk = 3, Status = StudyGuideImportSessionStatus.InProgress,
            CreatedUtc = DateTime.UtcNow, UpdatedUtc = DateTime.UtcNow
        };
        return (guide, session);
    }

    [Fact]
    public async Task HandleAsync_ReturnsInvalid_WhenDedupJsonIsNotArray()
    {
        string userId = Guid.NewGuid().ToString();
        var (guide, session) = CreateSessionData(userId);
        DbContext.StudyGuides.Add(guide);
        DbContext.StudyGuideImportSessions.Add(session);
        await DbContext.SaveChangesAsync();

        var result = await SubmitDedupResult.HandleAsync(
            session.Id.ToString(), "{\"not\":\"array\"}", DbContext, userId, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.ValidationStatus.Should().Be("Invalid");
    }

    [Fact]
    public async Task HandleAsync_ReturnsNull_WhenSessionNotFound()
    {
        var result = await SubmitDedupResult.HandleAsync(
            Guid.NewGuid().ToString(), "[]", DbContext, Guid.NewGuid().ToString(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ReturnsNull_WhenIdIsNotGuid()
    {
        var result = await SubmitDedupResult.HandleAsync(
            "bad-id", "[]", DbContext, Guid.NewGuid().ToString(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }
}

public sealed class StudyGuideItemValidatorTests
{
    private static List<JsonElement> ParseArray(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var list = new List<JsonElement>();
        foreach (var e in doc.RootElement.EnumerateArray())
            list.Add(e.Clone());
        return list;
    }

    [Fact]
    public void ValidateAndMap_ReturnsInvalid_WhenArrayIsEmpty()
    {
        var (isValid, messages, items, _) = StudyGuideItemValidator.ValidateAndMap(
            new List<JsonElement>(), "exams", new[] { "aws", "saa-c03" }, new());

        // An empty array is considered invalid (isValid = false) because items.Count > 0 is required.
        // No messages are added for the empty case (the "No valid items" guard only triggers when array.Count > 0).
        isValid.Should().BeFalse();
        items.Should().BeNullOrEmpty();
    }

    [Fact]
    public void ValidateAndMap_ReturnsInvalid_WhenItemsMissingRequiredFields()
    {
        var array = ParseArray("[{\"question\":\"What is EC2?\"}]");

        var (isValid, messages, _, _) = StudyGuideItemValidator.ValidateAndMap(
            array, "exams", new[] { "aws", "saa-c03" }, new());

        isValid.Should().BeFalse();
        messages.Should().NotBeEmpty();
    }

    [Fact]
    public void ValidateAndMap_ReturnsValid_WhenItemsHaveRequiredFields()
    {
        var json = """
        [
            {
                "question": "What is EC2?",
                "correctAnswer": "A compute service",
                "incorrectAnswers": ["Storage", "Database", "Network"]
            }
        ]
        """;
        var array = ParseArray(json);

        var (isValid, _, items, enrichedJson) = StudyGuideItemValidator.ValidateAndMap(
            array, "exams", new[] { "aws", "saa-c03" }, new());

        isValid.Should().BeTrue();
        items.Should().ContainSingle();
        enrichedJson.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void ValidateAndMap_OverridesCategory_WithSessionCategory()
    {
        var json = """
        [
            {
                "question": "Q?",
                "correctAnswer": "A",
                "incorrectAnswers": ["B", "C", "D"],
                "category": "wrong-category"
            }
        ]
        """;
        var array = ParseArray(json);

        var (isValid, _, items, enrichedJson) = StudyGuideItemValidator.ValidateAndMap(
            array, "exams", new[] { "aws", "saa-c03" }, new());

        isValid.Should().BeTrue();
        items!.Should().ContainSingle();
        // The category override is stored in the enriched JSON, not on ItemRequest itself
        enrichedJson.Should().Contain("exams");
    }
}
