using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

/// <summary>#369 on real PostgreSQL (pg_trgm): similar-check flags and accept with SkipCandidateIds. Requires Docker.</summary>
[Trait("Category", "Postgres")]
public sealed class StudyGuideSimilarityPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private static readonly DateTime Now = new(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc);
    private const string Capital = "What is the capital city of France according to the guide?";

    private readonly TaxonomyRegistry _taxonomy = new(new TestHostEnvironment(), Options.Create(new TaxonomyOptions()), NullLogger<TaxonomyRegistry>.Instance);

    private async Task<Guid> EnsureCategoryAsync(string name)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category? existing = await db.Categories.FirstOrDefaultAsync(c => c.Name == name);
        if (existing is not null)
        {
            return existing.Id;
        }

        Category category = new() { Id = Guid.NewGuid(), Name = name, IsPrivate = false, CreatedBy = "seeder", CreatedAt = Now };
        db.Categories.Add(category);
        if (name == "geography")
        {
            Keyword capitals = new() { Id = Guid.NewGuid(), Name = "capitals", IsPrivate = false, CreatedBy = "seeder", CreatedAt = Now };
            Keyword europe = new() { Id = Guid.NewGuid(), Name = "europe", IsPrivate = false, CreatedBy = "seeder", CreatedAt = Now };
            db.Keywords.AddRange(capitals, europe);
            db.KeywordRelations.AddRange(
                new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = null, ChildKeywordId = capitals.Id, SortOrder = 0, CreatedAt = Now },
                new KeywordRelation { Id = Guid.NewGuid(), CategoryId = category.Id, ParentKeywordId = capitals.Id, ChildKeywordId = europe.Id, SortOrder = 0, CreatedAt = Now });
        }

        await db.SaveChangesAsync();
        return category.Id;
    }

    private async Task<Guid> SeedItemAsync(string category, string createdBy, bool isPrivate, string question, string answer, string explanation = "")
    {
        Guid categoryId = await EnsureCategoryAsync(category);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Guid id = Guid.NewGuid();
        db.Items.Add(new Item
        {
            Id = id,
            Question = question,
            CorrectAnswer = answer,
            IncorrectAnswers = ["x", "y"],
            Explanation = explanation,
            FuzzySignature = "0000000000000000",
            CreatedBy = createdBy,
            CreatedAt = Now,
            IsPrivate = isPrivate,
            CategoryId = categoryId
        });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<(Guid DocumentId, List<Guid> CandidateIds)> SeedDocumentAsync(
        string userId, params (string Question, string Answer, int? Page)[] candidates)
    {
        await EnsureCategoryAsync("geography");
        Guid documentId = Guid.NewGuid();
        Guid generationId = Guid.NewGuid();
        string hash = Guid.NewGuid().ToString("N");
        List<Guid> candidateIds = [];
        await using ApplicationDbContext db = fixture.CreateDbContext();
        db.SectionGenerations.Add(new SectionGeneration
        {
            Id = generationId,
            TextSha256 = hash,
            Status = SectionGenerationStatus.Completed,
            NotBeforeUtc = Now,
            CreatedUtc = Now,
            QueuedUtc = Now,
            CompletedUtc = Now
        });
        for (int i = 0; i < candidates.Length; i++)
        {
            Guid id = Guid.NewGuid();
            candidateIds.Add(id);
            db.GenerationCandidates.Add(new GenerationCandidate
            {
                Id = id,
                GenerationId = generationId,
                Index = i,
                Question = candidates[i].Question,
                CorrectAnswer = candidates[i].Answer,
                IncorrectAnswersJson = "[\"Town\",\"Village\"]",
                Explanation = "Because the guide says so.",
                SourceQuote = "quote",
                Page = candidates[i].Page
            });
        }

        db.StudyGuideDocuments.Add(new StudyGuideDocument
        {
            Id = documentId,
            UserId = userId,
            Title = "Capitals notes",
            FileType = "txt",
            FileSha256 = hash,
            TextSha256 = hash,
            CategoryName = "geography",
            NavigationKeyword1 = "capitals",
            NavigationKeyword2 = "europe",
            CreatedUtc = Now,
            LastActivityUtc = Now,
            ExpiresUtc = Now.AddDays(30),
            Sections =
            [
                new StudyGuideSection
                {
                    Id = Guid.NewGuid(),
                    Index = 0,
                    Label = "Section 1",
                    TextSha256 = hash,
                    SizeBytes = 100,
                    GenerationId = generationId
                }
            ]
        });
        await db.SaveChangesAsync();
        return (documentId, candidateIds);
    }

    private async Task<CheckStudyGuideSimilarity.Response> CheckAsync(string userId, Guid documentId, List<Guid> ids)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        CheckStudyGuideSimilarity.Response? response = await CheckStudyGuideSimilarity.HandleAsync(documentId, ids, db, userId, CancellationToken.None);
        response.Should().NotBeNull();
        return response!;
    }

    [SkippableFact]
    public async Task SimilarVisibleItemInSameCategory_IsFlaggedWithTheItemQuestion()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        Guid itemId = await SeedItemAsync("geography", "someone-else", isPrivate: false, "  " + Capital.ToUpperInvariant() + " ", "Paris");
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(userId, (Capital.Replace("guide", "notes"), "Paris", 2));

        CheckStudyGuideSimilarity.Response response = await CheckAsync(userId, documentId, ids);

        CheckStudyGuideSimilarity.Flag flag = response.Flags.Should().ContainSingle().Subject;
        flag.CandidateId.Should().Be(ids[0].ToString());
        flag.SimilarTo.Kind.Should().Be("item");
        flag.SimilarTo.ItemId.Should().Be(itemId.ToString());
        flag.SimilarTo.Similarity.Should().BeGreaterThanOrEqualTo(0.6);
        flag.Conflict.Should().BeNull("both answers are Paris");
    }

    [SkippableFact]
    public async Task SameTextInAnotherCategory_IsNotFlagged()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        string question = $"Which river flows through the city of Vienna {Guid.NewGuid():N}?";
        await SeedItemAsync("history", "someone-else", isPrivate: false, question, "Danube");
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(userId, (question, "Danube", 1));

        (await CheckAsync(userId, documentId, ids)).Flags.Should().BeEmpty();
    }

    [SkippableFact]
    public async Task AnotherUsersPrivateItem_IsNotFlagged_ButMyOwnPrivateItemIs()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        string question = $"Which mountain range separates Spain from France {Guid.NewGuid():N}?";
        await SeedItemAsync("geography", "other-user-" + Guid.NewGuid(), isPrivate: true, question, "Pyrenees");
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(userId, (question, "Pyrenees", 1));

        (await CheckAsync(userId, documentId, ids)).Flags.Should().BeEmpty();

        await SeedItemAsync("geography", userId, isPrivate: true, question, "Pyrenees");
        (await CheckAsync(userId, documentId, ids)).Flags.Should().ContainSingle();
    }

    [SkippableFact]
    public async Task TwoSimilarCandidatesInOneUpload_FlagTheLaterOneAsSimilarToTheEarlier_BelowThresholdIsNotFlagged()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        string stem = $"Which ocean borders the western coast of Portugal {Guid.NewGuid():N}";
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(
            userId,
            (stem + "?", "Atlantic", 3),
            (stem + " today?", "Atlantic", 4),
            ("Name the longest river of Poland entirely inside its borders.", "Vistula", 5));

        CheckStudyGuideSimilarity.Response response = await CheckAsync(userId, documentId, ids);

        CheckStudyGuideSimilarity.Flag flag = response.Flags.Should().ContainSingle().Subject;
        flag.CandidateId.Should().Be(ids[1].ToString());
        flag.SimilarTo.Kind.Should().Be("candidate");
        flag.SimilarTo.CandidateId.Should().Be(ids[0].ToString());
    }

    [SkippableFact]
    public async Task DisagreeingAnswers_ReturnBothAnswersWithSourceAndPage_AndNothingIsResolved()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        string question = $"In which year was the treaty of Westphalia signed {Guid.NewGuid():N}?";
        await SeedItemAsync("geography", userId, isPrivate: true, question, "1648", "Old.\n\nFrom \"Earlier guide\", Section 2");
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(userId, (question, "1649", 7));

        CheckStudyGuideSimilarity.Response response = await CheckAsync(userId, documentId, ids);

        CheckStudyGuideSimilarity.Conflict conflict = response.Flags.Should().ContainSingle().Subject.Conflict!;
        conflict.Answers.Should().BeEquivalentTo(
        [
            new CheckStudyGuideSimilarity.ConflictAnswer("1649", "Capitals notes", 7, "this"),
            new CheckStudyGuideSimilarity.ConflictAnswer("1648", "Earlier guide", null, "other")
        ]);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        (await db.Items.CountAsync(i => i.UploadId == documentId)).Should().Be(0, "similar-check is read-only");
    }

    [SkippableFact]
    public async Task SimilarCheck_ForAnotherUsersDocument_ReturnsNull()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(Guid.NewGuid().ToString(), (Capital, "Paris", 1));
        await using ApplicationDbContext db = fixture.CreateDbContext();

        (await CheckStudyGuideSimilarity.HandleAsync(documentId, ids, db, "intruder", CancellationToken.None)).Should().BeNull();
    }

    private async Task<Result<AcceptStudyGuideCandidates.Response?>> AcceptAsync(string userId, Guid documentId, List<Guid> ids, List<Guid>? skip)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return await AcceptStudyGuideCandidates.HandleAsync(
            documentId,
            new AcceptStudyGuideCandidates.Request(
                ids.Select(id => new AcceptStudyGuideCandidates.CandidateEdit(id, null, null, null, null)).ToList(),
                SkipCandidateIds: skip),
            db,
            StudyGuideTestData.User(userId).Object,
            new SimHashService(),
            new TaxonomyItemCategoryResolver(db, _taxonomy),
            _taxonomy,
            Mock.Of<IAuditService>(),
            StudyGuideTestData.Moderation(),
            30,
            Now,
            CancellationToken.None);
    }

    [SkippableFact]
    public async Task Accept_WithSkipCandidateIds_SkipsExactlyThoseAndReportsSkippedCount()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        string tag = Guid.NewGuid().ToString("N");
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(
            userId, ($"First distinct question {tag}?", "A", 1), ($"Second unrelated prompt {tag}?", "B", 2), ($"Third separate topic {tag}?", "C", 3));

        Result<AcceptStudyGuideCandidates.Response?> result = await AcceptAsync(userId, documentId, ids, [ids[1]]);

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error.Description : null);
        result.Value!.CreatedCount.Should().Be(2);
        result.Value.SkippedCount.Should().Be(1);
        result.Value.FailedCount.Should().Be(0);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        List<Guid> accepted = await db.StudyGuideAcceptedCandidates.Where(a => a.DocumentId == documentId).Select(a => a.CandidateId).ToListAsync();
        accepted.Should().BeEquivalentTo([ids[0], ids[2]]);
    }

    [SkippableFact]
    public async Task Accept_WithNullSkipList_KeepsBothAndIsUnchanged()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        string userId = Guid.NewGuid().ToString();
        string tag = Guid.NewGuid().ToString("N");
        (Guid documentId, List<Guid> ids) = await SeedDocumentAsync(
            userId, ($"Fourth distinct question {tag}?", "A", 1), ($"Fifth unrelated prompt {tag}?", "B", 2));

        Result<AcceptStudyGuideCandidates.Response?> result = await AcceptAsync(userId, documentId, ids, null);

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error.Description : null);
        result.Value!.CreatedCount.Should().Be(2);
        result.Value.SkippedCount.Should().Be(0);
    }
}
