using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

/// <summary>
/// Saves the generated questions of "Make a quiz" sections (<see cref="StudyGuideAutoSave.Pending"/>) once their generation
/// has completed (#363, AC 6.6). The worker sweeps after every tick and the quick endpoint calls it inline when everything was
/// already cached. Each document is saved in its own DI scope and transaction as the document owner with a non-admin context:
/// items are always private, never published. Sections queued by an admin skip the daily quotas only (AC 17.4). Blocked or invalid candidates are skipped. Idempotent and safe to run on
/// several API instances (a busy document is skipped). A document that keeps failing is marked Failed after
/// <c>AutoSaveMaxAttempts</c> and left to the manual review flow. A daily item or collection quota refusal (AC 17) marks the
/// sections Failed at once.
/// </summary>
internal sealed class StudyGuideAutoSaver(
    ApplicationDbContext db,
    IServiceScopeFactory scopeFactory,
    ISimHashService simHashService,
    ITaxonomyItemCategoryResolver itemCategoryResolver,
    ITaxonomyRegistry taxonomyRegistry,
    IAuditService auditService,
    ITextModerationService moderation,
    IOptions<StudyGuideGenerationOptions> generationOptions,
    IOptions<StudyGuideDocumentOptions> documentOptions,
    IOptions<QuotaSettings> quotaOptions,
    TimeProvider timeProvider,
    ILogger<StudyGuideAutoSaver> logger)
{
    private readonly ApplicationDbContext _db = db;
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ISimHashService _simHashService = simHashService;
    private readonly ITaxonomyItemCategoryResolver _itemCategoryResolver = itemCategoryResolver;
    private readonly ITaxonomyRegistry _taxonomyRegistry = taxonomyRegistry;
    private readonly IAuditService _auditService = auditService;
    private readonly ITextModerationService _moderation = moderation;
    private readonly StudyGuideGenerationOptions _options = generationOptions.Value;
    private readonly int _retentionDays = documentOptions.Value.RetentionDays;
    private readonly QuotaSettings _quotas = quotaOptions.Value;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<StudyGuideAutoSaver> _logger = logger;

    /// <summary>The daily quota that refused the last <see cref="SaveDocumentAsync"/> call on this instance, if any.</summary>
    public Error? QuotaRefusal { get; private set; }

    /// <summary>Saves up to <c>AutoSaveBatchSize</c> documents that have completed Pending sections; returns how many were attempted.</summary>
    public async Task<int> SweepAsync(CancellationToken cancellationToken)
    {
        List<Guid> documentIds = await _db.StudyGuideSections
            .AsNoTracking()
            .Where(section => section.AutoSave == StudyGuideAutoSave.Pending && section.GenerationId != null &&
                              _db.SectionGenerations.Any(generation => generation.Id == section.GenerationId &&
                                                                       generation.Status == SectionGenerationStatus.Completed))
            .Select(section => section.DocumentId)
            .Distinct()
            .OrderBy(documentId => documentId)
            .Take(Math.Clamp(_options.AutoSaveBatchSize, 1, 200))
            .ToListAsync(cancellationToken);

        foreach (Guid documentId in documentIds)
        {
            try
            {
                await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<StudyGuideAutoSaver>().SaveDocumentAsync(documentId, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "StudyGuideAutoSave: unexpected error saving document {DocumentId}.", documentId);
            }
        }

        return documentIds.Count;
    }

    /// <summary>Saves the document's completed Pending sections. Returns false when it failed or was busy (another instance holds the document).</summary>
    public async Task<bool> SaveDocumentAsync(Guid documentId, CancellationToken cancellationToken)
    {
        List<Guid> sectionIds = [];
        QuotaRefusal = null;
        try
        {
            string? ownerId = await _db.StudyGuideDocuments
                .AsNoTracking()
                .Where(document => document.Id == documentId)
                .Select(document => document.UserId)
                .FirstOrDefaultAsync(cancellationToken);
            if (ownerId is null)
            {
                return false;
            }

            var ready = await _db.StudyGuideSections
                .AsNoTracking()
                .Where(section => section.DocumentId == documentId && section.AutoSave == StudyGuideAutoSave.Pending &&
                                  section.GenerationId != null &&
                                  _db.SectionGenerations.Any(generation => generation.Id == section.GenerationId &&
                                                                           generation.Status == SectionGenerationStatus.Completed))
                .Select(section => new { section.Id, GenerationId = section.GenerationId!.Value, section.AutoSaveQuotaExempt })
                .ToListAsync(cancellationToken);
            if (ready.Count == 0)
            {
                return true;
            }

            sectionIds = ready.Select(section => section.Id).ToList();
            // One accept saves every ready section, so all of them must carry the exemption.
            bool quotaExempt = ready.All(section => section.AutoSaveQuotaExempt);
            List<Guid> generationIds = ready.Select(section => section.GenerationId).Distinct().ToList();
            List<Guid> candidateIds = await _db.GenerationCandidates
                .AsNoTracking()
                .Where(candidate => generationIds.Contains(candidate.GenerationId))
                .Select(candidate => candidate.Id)
                .ToListAsync(cancellationToken);

            AcceptStudyGuideCandidates.Request request = new(
                candidateIds.Select(id => new AcceptStudyGuideCandidates.CandidateEdit(id, null, null, null, null)).ToList());
            Result<AcceptStudyGuideCandidates.Response?> result = await AcceptStudyGuideCandidates.HandleAsync(
                documentId,
                request,
                _db,
                new OwnerUserContext(ownerId),
                _simHashService,
                _itemCategoryResolver,
                _taxonomyRegistry,
                _auditService,
                _moderation,
                _retentionDays,
                _timeProvider.GetUtcNow().UtcDateTime,
                cancellationToken,
                _logger,
                sectionIds,
                quotaExempt ? QuotaSettings.Unlimited : _quotas);
            if (result.IsSuccess)
            {
                return true;
            }

            if (result.Error.Code == StudyGuideDocumentErrors.Conflict.Code)
            {
                return false;
            }

            _logger.LogWarning("StudyGuideAutoSave: document {DocumentId} not saved: {Error}.", documentId, result.Error.Code);
            if (CreationQuota.IsQuotaError(result.Error))
            {
                QuotaRefusal = result.Error;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "StudyGuideAutoSave: saving document {DocumentId} failed.", documentId);
        }

        // A quota refusal would repeat on every retry today, so it fails the sections at once (manual review stays possible).
        await RecordFailureAsync(documentId, sectionIds, giveUpNow: QuotaRefusal is not null, cancellationToken);
        return false;
    }

    private async Task RecordFailureAsync(Guid documentId, List<Guid> sectionIds, bool giveUpNow, CancellationToken cancellationToken)
    {
        try
        {
            _db.ChangeTracker.Clear();
            List<StudyGuideSection> sections = await _db.StudyGuideSections
                .Where(section => section.DocumentId == documentId && sectionIds.Contains(section.Id) &&
                                  section.AutoSave == StudyGuideAutoSave.Pending)
                .ToListAsync(cancellationToken);
            int maxAttempts = Math.Max(1, _options.AutoSaveMaxAttempts);
            foreach (StudyGuideSection section in sections)
            {
                if (!giveUpNow)
                {
                    section.AutoSaveAttempts++;
                }

                if (giveUpNow || section.AutoSaveAttempts >= maxAttempts)
                {
                    section.AutoSave = StudyGuideAutoSave.Failed;
                    _logger.LogWarning(
                        "StudyGuideAutoSave: section {SectionId} of document {DocumentId} gave up after {Attempts} attempts.",
                        section.Id,
                        documentId,
                        section.AutoSaveAttempts);
                }
            }

            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "StudyGuideAutoSave: could not record the failure for document {DocumentId}.", documentId);
        }
    }

    /// <summary>The document owner as a non-admin caller, so items are always private.</summary>
    private sealed class OwnerUserContext(string userId) : IUserContext
    {
        public bool IsAuthenticated => true;

        public string? UserId { get; } = userId;

        public bool IsAdmin => false;
    }
}
