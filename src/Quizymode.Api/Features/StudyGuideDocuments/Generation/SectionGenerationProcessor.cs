using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

/// <summary>
/// Runs one claimed generation (AC 6.6): takes the tier's vendor route (premium route when the job's tier is Premium),
/// skips vendors without an API key, and tries them in order with prompt v2. A vendor attempt fails over to the next
/// vendor on a provider error, auth error (rejected key), timeout, content-filter stop, invalid JSON, or low quote yield (no question kept, or fewer
/// than half kept). Every attempt is logged in <c>LlmAttempts</c> with its outcome and the vendor's HTTP status. On success the candidates are saved, the source text is
/// cleared, and tokens/vendor/model are recorded. When every vendor fails, the best low-yield result is kept if it has
/// at least one verified question; otherwise the job is Failed with a user-safe error and its quota charges are refunded.
/// Idempotent: jobs that are missing or no longer Processing are skipped.
/// </summary>
internal sealed class SectionGenerationProcessor(
    ApplicationDbContext db,
    IOpenAiCompatibleChatClient chatClient,
    ILlmVendorRegistry vendors,
    ITextModerationService moderation,
    IOptions<StudyGuideGenerationOptions> options,
    TimeProvider timeProvider,
    ILogger<SectionGenerationProcessor> logger)
{
    public const string FailureMessage =
        "We couldn't generate questions for this section right now. The section was not charged; please try again later.";

    private static readonly JsonSerializerOptions AnswerJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ApplicationDbContext _db = db;
    private readonly IOpenAiCompatibleChatClient _chatClient = chatClient;
    private readonly ILlmVendorRegistry _vendors = vendors;
    private readonly ITextModerationService _moderation = moderation;
    private readonly StudyGuideGenerationOptions _options = options.Value;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<SectionGenerationProcessor> _logger = logger;

    public async Task ProcessAsync(Guid generationId, CancellationToken cancellationToken)
    {
        SectionGeneration? generation = await _db.SectionGenerations
            .FirstOrDefaultAsync(g => g.Id == generationId, cancellationToken);
        if (generation is null || generation.Status != SectionGenerationStatus.Processing)
        {
            return;
        }

        if (generation.Attempts > Math.Max(1, _options.MaxAttempts) || string.IsNullOrWhiteSpace(generation.SourceText))
        {
            await FailAsync(generation, cancellationToken);
            return;
        }

        LlmProviderSettings settings = await LlmProviderSettingsStore.GetOrCreateAsync(_db, cancellationToken);
        List<string> route = LlmProviderSettingsStore.RouteFor(settings, generation.Tier)
            .Where(_vendors.IsConfigured)
            .ToList();
        if (route.Count == 0)
        {
            _logger.LogWarning("StudyGuideGeneration: no configured vendor in the {Tier} route.", generation.Tier);
            await FailAsync(generation, cancellationToken);
            return;
        }

        string sourceText = generation.SourceText;
        int maxQuestions = Math.Clamp(_options.MaxQuestions, 1, 20);
        ChatCompletionRequest request = new(
            StudyGuidePromptV2.SystemPrompt,
            StudyGuidePromptV2.BuildUserPrompt(sourceText, maxQuestions),
            Math.Max(256, _options.MaxTokens),
            _options.Temperature);

        (string Vendor, string Model, ChatCompletionResult Result, CandidateParseResult Parsed)? best = null;
        foreach (string vendor in route)
        {
            string model = LlmProviderSettingsStore.ModelFor(settings, vendor);
            generation.LeaseUntilUtc = Now().AddMinutes(Math.Max(1, _options.LeaseMinutes));
            await _db.SaveChangesAsync(cancellationToken);

            ChatCompletionResult result = await _chatClient.CompleteAsync(_vendors.Get(vendor), model, request, cancellationToken);
            LlmAttemptOutcome outcome = result.Outcome;
            CandidateParseResult? parsed = null;
            if (outcome == LlmAttemptOutcome.Success)
            {
                parsed = StudyGuideCandidateParser.Parse(result.Content ?? string.Empty, sourceText, maxQuestions, _moderation);
                if (!parsed.IsValidJson)
                {
                    outcome = LlmAttemptOutcome.InvalidJson;
                }
                else if (parsed.IsLowYield)
                {
                    outcome = LlmAttemptOutcome.LowQuoteYield;
                    if (parsed.Kept.Count > 0 && (best is null || parsed.Kept.Count > best.Value.Parsed.Kept.Count))
                    {
                        best = (vendor, model, result, parsed);
                    }
                }
            }

            _db.LlmAttempts.Add(new LlmAttempt
            {
                Id = Guid.NewGuid(),
                GenerationId = generation.Id,
                Vendor = vendor,
                Model = model,
                Outcome = outcome,
                InputTokens = result.InputTokens,
                OutputTokens = result.OutputTokens,
                DurationMs = result.DurationMs,
                HttpStatus = result.HttpStatus,
                CreatedUtc = Now()
            });

            if (outcome == LlmAttemptOutcome.Success && parsed is not null)
            {
                await CompleteAsync(generation, vendor, model, result, parsed, cancellationToken);
                return;
            }

            await _db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation(
                "StudyGuideGeneration: {GenerationId} attempt with {Vendor} ended {Outcome}; trying the next vendor.",
                generation.Id,
                vendor,
                outcome);
        }

        if (best is not null)
        {
            await CompleteAsync(generation, best.Value.Vendor, best.Value.Model, best.Value.Result, best.Value.Parsed, cancellationToken);
            return;
        }

        await FailAsync(generation, cancellationToken);
    }

    private async Task CompleteAsync(
        SectionGeneration generation,
        string vendor,
        string model,
        ChatCompletionResult result,
        CandidateParseResult parsed,
        CancellationToken cancellationToken)
    {
        DateTime now = Now();
        generation.Status = SectionGenerationStatus.Completed;
        generation.Vendor = vendor;
        generation.Model = model;
        generation.InputTokens = result.InputTokens;
        generation.OutputTokens = result.OutputTokens;
        generation.DroppedCount = parsed.DroppedCount;
        generation.Error = null;
        generation.SourceText = null;
        generation.LeaseUntilUtc = null;
        generation.CompletedUtc = now;

        List<GenerationCandidate> existing = await _db.GenerationCandidates
            .Where(candidate => candidate.GenerationId == generation.Id)
            .ToListAsync(cancellationToken);
        _db.GenerationCandidates.RemoveRange(existing);
        _db.GenerationCandidates.AddRange(parsed.Kept.Select((candidate, index) => new GenerationCandidate
        {
            Id = Guid.NewGuid(),
            GenerationId = generation.Id,
            Index = index,
            Question = candidate.Question,
            CorrectAnswer = candidate.CorrectAnswer,
            IncorrectAnswersJson = JsonSerializer.Serialize(candidate.IncorrectAnswers, AnswerJsonOptions),
            Explanation = candidate.Explanation,
            SourceQuote = candidate.SourceQuote,
            Page = candidate.Page
        }));

        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation(
            "StudyGuideGeneration: {GenerationId} completed by {Vendor} with {Kept} question(s), {Dropped} dropped.",
            generation.Id,
            vendor,
            parsed.Kept.Count,
            parsed.DroppedCount);
    }

    /// <summary>Marks the job Failed with a user-safe error and refunds every quota charge attached to it.</summary>
    internal async Task FailAsync(SectionGeneration generation, CancellationToken cancellationToken)
    {
        DateTime now = Now();
        generation.Status = SectionGenerationStatus.Failed;
        generation.Error = FailureMessage;
        generation.SourceText = null;
        generation.LeaseUntilUtc = null;
        generation.CompletedUtc = now;

        List<StudyGuideQuotaCharge> charges = await _db.StudyGuideQuotaCharges
            .Where(charge => charge.GenerationId == generation.Id)
            .ToListAsync(cancellationToken);
        _db.StudyGuideQuotaCharges.RemoveRange(charges);
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "StudyGuideGeneration: {GenerationId} failed after {Attempts} attempt(s); refunded {Count} charge(s).",
            generation.Id,
            generation.Attempts,
            charges.Count);
    }

    private DateTime Now() => _timeProvider.GetUtcNow().UtcDateTime;
}
