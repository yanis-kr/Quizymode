using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>
/// Processes one queued upload: one LLM call, strict validation, profanity check on the output, then Completed or Failed.
/// Idempotent: uploads that are missing or no longer Pending are skipped.
/// </summary>
internal sealed class StudyGuideUploadProcessor(
    ApplicationDbContext db,
    IStudyGuideQuestionGenerator generator,
    ITextModerationService moderation,
    IOptions<AnthropicOptions> options,
    ILogger<StudyGuideUploadProcessor> logger)
{
    internal static readonly JsonSerializerOptions QuestionJsonOptions = new(JsonSerializerDefaults.Web);

    public const string ModerationFailureMessage =
        "The generated questions did not pass content moderation. Try different study material.";

    private readonly ApplicationDbContext _db = db;
    private readonly IStudyGuideQuestionGenerator _generator = generator;
    private readonly ITextModerationService _moderation = moderation;
    private readonly AnthropicOptions _options = options.Value;
    private readonly ILogger<StudyGuideUploadProcessor> _logger = logger;

    public async Task ProcessAsync(Guid uploadId, CancellationToken cancellationToken)
    {
        StudyGuideUpload? upload = await _db.StudyGuideUploads
            .FirstOrDefaultAsync(u => u.Id == uploadId, cancellationToken);

        if (upload is null || upload.Status != StudyGuideUploadStatus.Pending)
        {
            return;
        }

        upload.Attempts++;
        int maxQuestions = Math.Clamp(_options.MaxQuestions, 1, 20);

        QuestionGenerationResult generation = await _generator.GenerateAsync(
            new QuestionGenerationRequest(
                upload.InputText,
                upload.CategoryName,
                upload.NavigationKeyword1,
                upload.NavigationKeyword2,
                maxQuestions),
            cancellationToken);

        if (!generation.Succeeded || generation.RawText is null)
        {
            await FailAsync(upload, generation.FailureReason ?? AnthropicQuestionGenerator.UnavailableMessage, cancellationToken);
            return;
        }

        Result<List<StudyGuideGeneratedQuestion>> parsed = StudyGuideQuestionParser.Parse(
            generation.RawText,
            upload.CategoryName,
            upload.NavigationKeyword1,
            upload.NavigationKeyword2,
            maxQuestions);

        if (parsed.IsFailure)
        {
            await FailAsync(upload, parsed.Error.Description, cancellationToken);
            return;
        }

        if (StudyGuideQuestionParser.IsBlocked(_moderation, parsed.Value))
        {
            await FailAsync(upload, ModerationFailureMessage, cancellationToken);
            return;
        }

        DateTime now = DateTime.UtcNow;
        upload.Status = StudyGuideUploadStatus.Completed;
        upload.GeneratedQuestionsJson = JsonSerializer.Serialize(parsed.Value, QuestionJsonOptions);
        upload.Error = null;
        upload.CompletedUtc = now;
        upload.UpdatedUtc = now;
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "StudyGuideUpload: {UploadId} completed with {Count} question(s).",
            upload.Id,
            parsed.Value.Count);
    }

    /// <summary>Best-effort terminal failure for unexpected errors so the upload does not stay Pending forever.</summary>
    public async Task MarkFailedAsync(Guid uploadId, string reason, CancellationToken cancellationToken)
    {
        StudyGuideUpload? upload = await _db.StudyGuideUploads
            .FirstOrDefaultAsync(u => u.Id == uploadId, cancellationToken);
        if (upload is null || upload.Status != StudyGuideUploadStatus.Pending)
        {
            return;
        }

        await FailAsync(upload, reason, cancellationToken);
    }

    private async Task FailAsync(StudyGuideUpload upload, string reason, CancellationToken cancellationToken)
    {
        DateTime now = DateTime.UtcNow;
        upload.Status = StudyGuideUploadStatus.Failed;
        upload.Error = reason.Length > 1000 ? reason[..1000] : reason;
        upload.CompletedUtc = now;
        upload.UpdatedUtc = now;
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("StudyGuideUpload: {UploadId} failed: {Reason}", upload.Id, upload.Error);
    }
}
