using System.Diagnostics.Metrics;
namespace Quizymode.Api.Features.Media;
internal static class MediaMetrics
{
    private static readonly Meter Meter = new("Quizymode.Media", "1.0");
    private static long pending; private static double oldestSeconds; private static long retainedBytes; private static long retries; private static long cleanupBacklog;
    private static readonly ObservableGauge<long> Pending = Meter.CreateObservableGauge("quizymode.media.pending", () => Interlocked.Read(ref pending));
    private static readonly ObservableGauge<double> Oldest = Meter.CreateObservableGauge("quizymode.media.oldest_pending_seconds", () => Volatile.Read(ref oldestSeconds));
    private static readonly ObservableGauge<long> Retained = Meter.CreateObservableGauge("quizymode.media.retained_bytes", () => Interlocked.Read(ref retainedBytes));
    private static readonly ObservableGauge<long> RetryBacklog = Meter.CreateObservableGauge("quizymode.media.delete_retries", () => Interlocked.Read(ref retries));
    private static readonly ObservableGauge<long> CleanupBacklog = Meter.CreateObservableGauge("quizymode.media.cleanup_backlog", () => Interlocked.Read(ref cleanupBacklog));
    internal static void Snapshot(long count, double age, long bytes, long retryCount, long backlog = 0) { Interlocked.Exchange(ref pending, count); Volatile.Write(ref oldestSeconds, age); Interlocked.Exchange(ref retainedBytes, bytes); Interlocked.Exchange(ref retries, retryCount); Interlocked.Exchange(ref cleanupBacklog, backlog); }
    internal static readonly Counter<long> Deliveries = Meter.CreateCounter<long>("quizymode.media.deliveries");
    internal static readonly Counter<long> DeliveredBytes = Meter.CreateCounter<long>("quizymode.media.delivered_bytes", unit: "By");
    internal static readonly Counter<long> Reviews = Meter.CreateCounter<long>("quizymode.media.reviews");
    /// <summary>Counts a refused upload by its stable problem code (a small fixed set; never an id, key or URL).</summary>
    internal static void UploadRefused(IResult result) { if (result is MediaProblemResult problem) Uploads.Add(1, new KeyValuePair<string, object?>("outcome", problem.Problem.Code)); }
    /// <summary>mode is proxy or cloudfront; outcome is ok, not_found or error.</summary>
    internal static void Delivered(string mode, string outcome) => Deliveries.Add(1, new KeyValuePair<string, object?>("mode", mode), new KeyValuePair<string, object?>("outcome", outcome));
    internal static readonly Counter<long> Uploads = Meter.CreateCounter<long>("quizymode.media.uploads");
    internal static readonly Counter<long> Reports = Meter.CreateCounter<long>("quizymode.media.reports");
    internal static readonly Counter<long> Withdrawals = Meter.CreateCounter<long>("quizymode.media.withdrawals");
    internal static readonly Counter<long> Cleanup = Meter.CreateCounter<long>("quizymode.media.cleanup");
    internal static readonly Counter<double> AdvisoryReservedUsd = Meter.CreateCounter<double>("quizymode.media.advisory_reserved_usd");
    internal static readonly Counter<double> AdvisoryEstimatedUsd = Meter.CreateCounter<double>("quizymode.media.advisory_estimated_usd");
    internal static readonly Counter<long> Advisory = Meter.CreateCounter<long>("quizymode.media.advisory");
}
