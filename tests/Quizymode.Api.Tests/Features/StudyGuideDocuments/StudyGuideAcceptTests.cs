using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

public sealed class StudyGuideAcceptTests : StudyGuideDocumentFixture
{
    private Task<Result<AcceptStudyGuideCandidates.Response?>> AcceptAsync(
        string documentId,
        IEnumerable<AcceptStudyGuideCandidates.CandidateEdit> candidates,
        string? userId = null) =>
        AcceptStudyGuideCandidates.HandleAsync(
            Guid.Parse(documentId),
            new AcceptStudyGuideCandidates.Request(candidates.ToList()),
            DbContext,
            StudyGuideTestData.User(userId ?? UserA).Object,
            SimHashService,
            TaxonomyItemCategoryResolver,
            TaxonomyRegistry,
            Mock.Of<IAuditService>(),
            StudyGuideTestData.Moderation(),
            DocumentOptions.RetentionDays,
            Clock.UtcNow,
            CancellationToken.None);

    private async Task<StudyGuideDocumentContracts.Document> GeneratedDocumentAsync(string title = "Europe Capitals")
    {
        StudyGuideDocumentContracts.Document document = await CreateTextAsync(MultiSectionText(2), title: title);
        await GenerateAsync(document, document.Sections.Take(1));
        await CompleteGenerationAsync(await GenerationIdOfAsync(document.Sections[0].Id), candidates: 3);
        return (await GetAsync(document.Id))!;
    }

    private static AcceptStudyGuideCandidates.CandidateEdit Pick(StudyGuideDocumentContracts.Candidate candidate) =>
        new(Guid.Parse(candidate.Id), null, null, null, null);

    [Theory]
    [InlineData("Paris", "paris", "Incorrect answers must be different from the correct answer.")]
    [InlineData("Paris", "Nice,nice", "Incorrect answers must be different from each other.")]
    public async Task Accept_EditedConflictingIncorrectAnswers_IsInvalidEditAndSavesNothing(string correct, string incorrectCsv, string message)
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();
        StudyGuideDocumentContracts.Candidate candidate = document.Sections[0].Candidates[0];

        Result<AcceptStudyGuideCandidates.Response?> result = await AcceptAsync(
            document.Id,
            [new AcceptStudyGuideCandidates.CandidateEdit(Guid.Parse(candidate.Id), null, correct, incorrectCsv.Split(',').ToList(), null)]);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("StudyGuideDocument.InvalidEdit");
        result.Error.Description.Should().Contain(message);
        (await DbContext.Items.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Accept_CreatesPrivateItemsAndALinkSharedCollectionNotInDiscover()
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();
        List<StudyGuideDocumentContracts.Candidate> candidates = document.Sections[0].Candidates;

        Result<AcceptStudyGuideCandidates.Response?> result = await AcceptAsync(document.Id, candidates.Take(2).Select(Pick));

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error.Description : null);
        result.Value!.CreatedCount.Should().Be(2);
        result.Value.DuplicateCount.Should().Be(0);
        result.Value.ItemIds.Should().HaveCount(2);

        Collection collection = await DbContext.Collections.SingleAsync(c => c.Id == Guid.Parse(result.Value.CollectionId));
        collection.Name.Should().Be("Europe Capitals");
        collection.Description.Should().Be("Generated from study guide Europe Capitals");
        collection.CreatedBy.Should().Be(UserA);
        collection.IsPublic.Should().BeFalse();
        collection.IsDiscoverable.Should().BeFalse();
        (await DbContext.CollectionItems.CountAsync(ci => ci.CollectionId == collection.Id)).Should().Be(2);

        List<Item> items = await DbContext.Items.Where(i => i.CreatedBy == UserA).OrderBy(i => i.Question).ToListAsync();
        items.Should().HaveCount(2).And.OnlyContain(item => item.IsPrivate && item.Source == null && item.UploadId == Guid.Parse(document.Id));
        items[0].Explanation.Should().Be($"Because the guide says so.\n\nFrom \"Europe Capitals\", {document.Sections[0].Label}");

        StudyGuideDocumentContracts.Document? reloaded = await GetAsync(document.Id);
        reloaded!.CollectionId.Should().Be(result.Value.CollectionId);
        reloaded.Sections[0].Candidates.Select(c => c.Accepted).Should().Equal(true, true, false);
        (await ListStudyGuideDocuments.HandleAsync(DbContext, UserA, CancellationToken.None)).Documents.Single().AcceptedCount.Should().Be(2);
    }

    [Fact]
    public async Task Accept_AgainSkipsAlreadyAcceptedAndAddsNewOnesToTheSameCollection()
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();
        List<StudyGuideDocumentContracts.Candidate> candidates = document.Sections[0].Candidates;
        Result<AcceptStudyGuideCandidates.Response?> first = await AcceptAsync(document.Id, candidates.Take(1).Select(Pick));

        Result<AcceptStudyGuideCandidates.Response?> second = await AcceptAsync(document.Id, candidates.Select(Pick));

        second.Value!.CollectionId.Should().Be(first.Value!.CollectionId);
        second.Value.CreatedCount.Should().Be(2);
        second.Value.DuplicateCount.Should().Be(1);
        (await DbContext.Items.CountAsync()).Should().Be(3);
        (await DbContext.Collections.CountAsync(c => c.CreatedBy == UserA)).Should().Be(1);
        (await DbContext.CollectionItems.CountAsync()).Should().Be(3);
    }

    [Fact]
    public async Task Accept_AppliesEditsAndValidatesThem()
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();
        StudyGuideDocumentContracts.Candidate candidate = document.Sections[0].Candidates[0];

        Result<AcceptStudyGuideCandidates.Response?> blocked = await AcceptAsync(document.Id,
            [new AcceptStudyGuideCandidates.CandidateEdit(Guid.Parse(candidate.Id), "Why badword?", null, null, null)]);
        Result<AcceptStudyGuideCandidates.Response?> edited = await AcceptAsync(document.Id,
            [new AcceptStudyGuideCandidates.CandidateEdit(Guid.Parse(candidate.Id), "Which city is the capital of France?", "Paris", ["Nice", "Lille"], "Edited.")]);

        blocked.Error.Code.Should().Be(StudyGuideDocumentErrors.ProfanityBlocked.Code);
        edited.Value!.CreatedCount.Should().Be(1);
        Item item = await DbContext.Items.SingleAsync();
        item.Question.Should().Be("Which city is the capital of France?");
        item.IncorrectAnswers.Should().Equal("Nice", "Lille");
        item.Explanation.Should().StartWith("Edited.\n\nFrom \"Europe Capitals\"");
    }

    [Fact]
    public void Accept_ValidatorRejectsBadEditsAndCounts()
    {
        AcceptStudyGuideCandidates.Validator validator = new();
        Guid id = Guid.NewGuid();

        validator.Validate(new AcceptStudyGuideCandidates.Request([])).IsValid.Should().BeFalse();
        validator.Validate(new AcceptStudyGuideCandidates.Request(Enumerable.Range(0, 201).Select(_ => new AcceptStudyGuideCandidates.CandidateEdit(Guid.NewGuid(), null, null, null, null)).ToList())).IsValid.Should().BeFalse();
        validator.Validate(new AcceptStudyGuideCandidates.Request([new(id, "", null, null, null)])).IsValid.Should().BeFalse();
        validator.Validate(new AcceptStudyGuideCandidates.Request([new(id, null, null, [], null)])).IsValid.Should().BeFalse();
        validator.Validate(new AcceptStudyGuideCandidates.Request([new(id, null, new string('a', 501), null, null)])).IsValid.Should().BeFalse();
        validator.Validate(new AcceptStudyGuideCandidates.Request([new(id, "Q?", "A", ["B"], "E")])).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Accept_CandidateFromAnotherDocument_IsRejected()
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();
        StudyGuideDocumentContracts.Document other = await CreateTextAsync(MultiSectionText(1, "other"));

        Result<AcceptStudyGuideCandidates.Response?> result = await AcceptAsync(other.Id, document.Sections[0].Candidates.Take(1).Select(Pick));
        Result<AcceptStudyGuideCandidates.Response?> unknown = await AcceptAsync(document.Id, [new(Guid.NewGuid(), null, null, null, null)]);

        result.Error.Should().Be(StudyGuideDocumentErrors.InvalidCandidates);
        unknown.Error.Should().Be(StudyGuideDocumentErrors.InvalidCandidates);
        (await DbContext.Items.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Accept_OtherUsersDocument_IsNotFound()
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();

        Result<AcceptStudyGuideCandidates.Response?> result = await AcceptAsync(document.Id, document.Sections[0].Candidates.Select(Pick), UserB);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeNull();
    }

    [Fact]
    public async Task Accept_DeletedCollectionIsRecreated()
    {
        StudyGuideDocumentContracts.Document document = await GeneratedDocumentAsync();
        List<StudyGuideDocumentContracts.Candidate> candidates = document.Sections[0].Candidates;
        Result<AcceptStudyGuideCandidates.Response?> first = await AcceptAsync(document.Id, candidates.Take(1).Select(Pick));
        await DbContext.CollectionItems.ExecuteDeleteAsync();
        await DbContext.Collections.Where(c => c.Id == Guid.Parse(first.Value!.CollectionId)).ExecuteDeleteAsync();
        DbContext.ChangeTracker.Clear();

        Result<AcceptStudyGuideCandidates.Response?> second = await AcceptAsync(document.Id, candidates.Skip(1).Take(1).Select(Pick));

        second.Value!.CollectionId.Should().NotBe(first.Value.CollectionId);
        (await DbContext.Collections.SingleAsync(c => c.CreatedBy == UserA)).IsDiscoverable.Should().BeFalse();
    }

    [Fact]
    public void Explanation_SuffixFitsItemLimit()
    {
        string explanation = AcceptStudyGuideCandidates.BuildExplanation(new string('e', 4000), "Title", "p. 3");

        explanation.Length.Should().BeLessThanOrEqualTo(4000);
        explanation.Should().EndWith("\n\nFrom \"Title\", p. 3");
    }

    [Fact]
    public async Task Cleanup_DeletesExpiredDocumentsButKeepsOnesWithSavedQuestionsWithoutText()
    {
        StudyGuideDocumentContracts.Document saved = await GeneratedDocumentAsync();
        await AcceptAsync(saved.Id, saved.Sections[0].Candidates.Take(1).Select(Pick));
        StudyGuideDocumentContracts.Document unsaved = await CreateTextAsync(MultiSectionText(1, "unsaved"));
        StudyGuideDocumentContracts.Document fresh = await CreateTextAsync(MultiSectionText(1, "fresh"));
        await DbContext.StudyGuideDocuments
            .Where(d => d.Id != Guid.Parse(fresh.Id))
            .ExecuteUpdateAsync(setters => setters.SetProperty(d => d.ExpiresUtc, Clock.UtcNow.AddDays(-1)));
        DbContext.LlmAttempts.AddRange(
            new LlmAttempt { Id = Guid.NewGuid(), Vendor = "Gemini", Model = "m", CreatedUtc = Clock.UtcNow.AddDays(-91) },
            new LlmAttempt { Id = Guid.NewGuid(), Vendor = "Gemini", Model = "m", CreatedUtc = Clock.UtcNow.AddDays(-89) });
        await DbContext.SaveChangesAsync();
        int generations = await DbContext.SectionGenerations.CountAsync();

        StudyGuideCleanupService.CleanupResult result = await StudyGuideCleanupService.CleanupAsync(DbContext, Clock.UtcNow, 90, CancellationToken.None);
        DbContext.ChangeTracker.Clear();

        result.Documents.Should().Be(1);
        result.SectionsCleared.Should().Be(2);
        result.Attempts.Should().Be(1);
        (await DbContext.StudyGuideDocuments.Select(d => d.Id).ToListAsync()).Should().BeEquivalentTo([Guid.Parse(saved.Id), Guid.Parse(fresh.Id)]);
        (await DbContext.StudyGuideSections.Where(s => s.DocumentId == Guid.Parse(unsaved.Id)).AnyAsync()).Should().BeFalse("sections cascade");
        StudyGuideDocumentContracts.Document? kept = await GetAsync(saved.Id);
        kept!.Sections.Should().OnlyContain(s => s.TextExpired && s.Preview == "");
        kept.Sections[0].Candidates.Should().HaveCount(3, "generations stay as a shared cache");
        (await DbContext.SectionGenerations.CountAsync()).Should().Be(generations);
        (await DbContext.Items.CountAsync()).Should().Be(1);
        (await GetAsync(fresh.Id))!.Sections.Should().OnlyContain(s => !s.TextExpired);
    }

    [Fact]
    public async Task ReUpload_RestoresExpiredTextAndResetsExpiry()
    {
        string text = MultiSectionText(2);
        StudyGuideDocumentContracts.Document document = await CreateTextAsync(text);
        await DbContext.StudyGuideSections.ExecuteUpdateAsync(setters => setters.SetProperty(s => s.Text, (string?)null));
        DbContext.ChangeTracker.Clear();
        Clock.UtcNow = Clock.UtcNow.AddDays(3);

        StudyGuideDocumentContracts.Document again = await CreateTextAsync(text);

        again.IsDuplicate.Should().BeTrue();
        again.ExpiresUtc.Should().Be(Clock.UtcNow.AddDays(30));
        again.Sections.Should().OnlyContain(s => !s.TextExpired);
        again.Id.Should().Be(document.Id);
    }
}
