using System.Threading.Channels;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>
/// In-process work queue of study guide upload ids. Job state lives in Postgres, so the queue only carries ids:
/// a lost or duplicated id is harmless because the processor skips uploads that are no longer Pending and the
/// worker re-enqueues every Pending upload on startup.
/// </summary>
internal sealed class StudyGuideUploadQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions
    {
        SingleReader = true,
        SingleWriter = false
    });

    public ChannelReader<Guid> Reader => _channel.Reader;

    public bool Enqueue(Guid uploadId) => _channel.Writer.TryWrite(uploadId);
}
