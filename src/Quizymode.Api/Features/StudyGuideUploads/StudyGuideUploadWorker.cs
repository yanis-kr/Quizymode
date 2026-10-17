using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>
/// In-API background job runner for study guide uploads. Reads upload ids from <see cref="StudyGuideUploadQueue"/>
/// and processes them one at a time. On startup every Pending upload is re-enqueued, so a restart mid-job resumes it.
/// Does nothing when no DeepSeek API key is configured.
/// </summary>
internal sealed class StudyGuideUploadWorker(
    StudyGuideUploadQueue queue,
    IServiceScopeFactory scopeFactory,
    IOptions<DeepSeekOptions> options,
    ILogger<StudyGuideUploadWorker> logger) : BackgroundService
{
    public const string UnexpectedFailureMessage = "Question generation failed unexpectedly. Please try again.";

    private readonly StudyGuideUploadQueue _queue = queue;
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly DeepSeekOptions _options = options.Value;
    private readonly ILogger<StudyGuideUploadWorker> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.IsConfigured)
        {
            _logger.LogInformation("StudyGuideUpload: worker disabled (no DeepSeek API key configured).");
            return;
        }

        await RequeuePendingAsync(stoppingToken);

        await foreach (Guid uploadId in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            await ProcessOneAsync(uploadId, stoppingToken);
        }
    }

    internal async Task<int> RequeuePendingAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            List<Guid> pendingIds = await db.StudyGuideUploads
                .Where(u => u.Status == StudyGuideUploadStatus.Pending)
                .OrderBy(u => u.CreatedUtc)
                .Select(u => u.Id)
                .ToListAsync(cancellationToken);

            foreach (Guid id in pendingIds)
            {
                _queue.Enqueue(id);
            }

            if (pendingIds.Count > 0)
            {
                _logger.LogInformation("StudyGuideUpload: re-enqueued {Count} pending upload(s).", pendingIds.Count);
            }

            return pendingIds.Count;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "StudyGuideUpload: failed to re-enqueue pending uploads.");
            return 0;
        }
    }

    internal async Task ProcessOneAsync(Guid uploadId, CancellationToken cancellationToken)
    {
        try
        {
            await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
            StudyGuideUploadProcessor processor = scope.ServiceProvider.GetRequiredService<StudyGuideUploadProcessor>();
            await processor.ProcessAsync(uploadId, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "StudyGuideUpload: unexpected error processing {UploadId}.", uploadId);
            try
            {
                await using AsyncServiceScope scope = _scopeFactory.CreateAsyncScope();
                StudyGuideUploadProcessor processor = scope.ServiceProvider.GetRequiredService<StudyGuideUploadProcessor>();
                await processor.MarkFailedAsync(uploadId, UnexpectedFailureMessage, cancellationToken);
            }
            catch (Exception markEx) when (markEx is not OperationCanceledException)
            {
                _logger.LogError(markEx, "StudyGuideUpload: could not mark {UploadId} failed.", uploadId);
            }
        }
    }
}
