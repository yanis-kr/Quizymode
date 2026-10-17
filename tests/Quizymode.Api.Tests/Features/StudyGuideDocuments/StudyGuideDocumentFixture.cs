using System.Text;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Features.StudyGuideDocuments.Generation;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

/// <summary>Database-backed fixture for study guide document flows (real taxonomy: geography / capitals / europe).</summary>
public abstract class StudyGuideDocumentFixture : ItemTestFixture, IAsyncLifetime
{
    protected static readonly string UserA = Guid.NewGuid().ToString();
    protected static readonly string UserB = Guid.NewGuid().ToString();

    internal TestClock Clock { get; } = new(new DateTime(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc));

    internal StudyGuideGenerationOptions GenerationOptions { get; } = new();

    internal StudyGuideDocumentOptions DocumentOptions { get; } = new();

    internal ILlmVendorRegistry Vendors { get; set; } = new LlmVendorRegistry(StudyGuideTestData.Keys());

    public virtual async Task InitializeAsync()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");
        DbContext.Users.AddRange(
            new User { Id = Guid.Parse(UserA), Subject = "user-a", Name = "User A" },
            new User { Id = Guid.Parse(UserB), Subject = "user-b", Name = "User B" });
        await DbContext.SaveChangesAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>Text with <paramref name="sections"/> distinct ~5 KB heading sections (each its own section).</summary>
    protected static string MultiSectionText(int sections, string seed = "fact")
    {
        StringBuilder builder = new();
        for (int i = 1; i <= sections; i++)
        {
            builder.Append($"# Topic {seed} {i}\n\n");
            builder.Append(string.Concat(Enumerable.Repeat($"The {seed} number {i} is an important idea to remember. ", 90)));
            builder.Append("\n\n");
        }

        return builder.ToString();
    }

    internal async Task<StudyGuideDocumentContracts.Document> CreateTextAsync(string text, string? userId = null, string? title = null)
    {
        Result<CreateStudyGuideDocument.Outcome> result = await CreateAsync(
            new CreateStudyGuideDocument.Request(text, title, "geography", "capitals", "europe", ["Chapter-1"]),
            null,
            userId);
        if (result.IsFailure)
        {
            throw new InvalidOperationException(result.Error.Code + ": " + result.Error.Description);
        }

        return result.Value.Document;
    }

    internal Task<Result<CreateStudyGuideDocument.Outcome>> CreateAsync(
        CreateStudyGuideDocument.Request request,
        CreateStudyGuideDocument.UploadedFile? file = null,
        string? userId = null) =>
        CreateStudyGuideDocument.HandleAsync(
            request,
            file,
            DbContext,
            userId ?? UserA,
            StudyGuideTestData.Moderation(),
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            StudyGuideTestData.Extractor(DocumentOptions),
            DocumentOptions,
            GenerationOptions,
            Clock.UtcNow,
            CancellationToken.None);

    internal Task<Result<GenerateStudyGuideSections.Response?>> GenerateAsync(
        StudyGuideDocumentContracts.Document document,
        IEnumerable<StudyGuideDocumentContracts.Section> sections,
        string? userId = null) =>
        GenerateAsync(Guid.Parse(document.Id), sections.Select(section => Guid.Parse(section.Id)), userId);

    internal Task<Result<GenerateStudyGuideSections.Response?>> GenerateAsync(Guid documentId, IEnumerable<Guid> sectionIds, string? userId = null) =>
        GenerateStudyGuideSections.HandleAsync(
            documentId,
            new GenerateStudyGuideSections.Request(sectionIds.ToList()),
            DbContext,
            userId ?? UserA,
            Vendors,
            GenerationOptions,
            DocumentOptions.RetentionDays,
            Clock.UtcNow,
            CancellationToken.None);

    internal Task<StudyGuideDocumentContracts.Document?> GetAsync(string documentId, string? userId = null) =>
        GetStudyGuideDocument.HandleAsync(Guid.Parse(documentId), DbContext, userId ?? UserA, GenerationOptions, Clock.UtcNow, CancellationToken.None);

    protected async Task SetSettingAsync(string userId, string key, string value)
    {
        DbContext.UserSettings.Add(new UserSetting { Id = Guid.NewGuid(), UserId = Guid.Parse(userId), Key = key, Value = value });
        await DbContext.SaveChangesAsync();
    }

    protected Task MakePremiumAsync(string userId) => SetSettingAsync(userId, StudyGuideSettingKeys.Premium, "true");

    /// <summary>Marks a generation Completed with candidates copied from <see cref="StudyGuideTestData.Facts"/>.</summary>
    protected async Task CompleteGenerationAsync(Guid generationId, int candidates = 2)
    {
        SectionGeneration generation = await DbContext.SectionGenerations.SingleAsync(g => g.Id == generationId);
        generation.Status = SectionGenerationStatus.Completed;
        generation.SourceText = null;
        generation.CompletedUtc = Clock.UtcNow;
        generation.DroppedCount = 1;
        DbContext.GenerationCandidates.AddRange(StudyGuideTestData.Facts.Take(candidates).Select((fact, index) => new GenerationCandidate
        {
            Id = Guid.NewGuid(),
            GenerationId = generationId,
            Index = index,
            Question = fact.Question,
            CorrectAnswer = fact.Answer,
            IncorrectAnswersJson = "[\"Lyon\",\"Vienna\",\"Lisbon\"]",
            Explanation = "Because the guide says so.",
            SourceQuote = fact.Quote,
            Page = 3
        }));
        await DbContext.SaveChangesAsync();
    }

    protected async Task<Guid> GenerationIdOfAsync(string sectionId)
    {
        Guid id = Guid.Parse(sectionId);
        return (await DbContext.StudyGuideSections.AsNoTracking().SingleAsync(s => s.Id == id)).GenerationId!.Value;
    }
}
