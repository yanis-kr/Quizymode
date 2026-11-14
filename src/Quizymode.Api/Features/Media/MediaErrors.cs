using System.Globalization;
using Microsoft.EntityFrameworkCore;

namespace Quizymode.Api.Features.Media;

/// <summary>A refusal with the HTTP status it maps to. <see cref="Code"/> is returned as the ProblemDetails title.</summary>
internal sealed record MediaProblem(string Code, string Detail, int StatusCode, int? RetryAfterSeconds = null)
{
    public IResult ToResult() => new MediaProblemResult(this);
}

internal static class MediaErrors
{
    /// <summary>Retry hint for allowances that free up only through user or maintenance action.</summary>
    public const int QuotaHintSeconds = 900;

    public const int GlobalBusySeconds = 5;

    public const int ConcurrencySeconds = 120;

    public static MediaProblem Quota(string code, string detail, int retryAfterSeconds) =>
        new(code, detail, StatusCodes.Status429TooManyRequests, Math.Max(1, retryAfterSeconds));

    /// <summary>Seconds until the attempt that must age out of the rolling window to free a slot leaves it.</summary>
    public static async Task<int> WindowRetryAsync(IQueryable<DateTime> times, int count, int limit, TimeSpan window, DateTime now, CancellationToken ct)
    {
        if (limit <= 0 || count <= 0)
        {
            return (int)window.TotalSeconds;
        }

        DateTime frees = await times.OrderBy(x => x).Skip(Math.Max(0, count - limit)).FirstAsync(ct);
        double seconds = Math.Ceiling((frees + window - now).TotalSeconds);
        return (int)Math.Clamp(seconds, 1, window.TotalSeconds);
    }

    /// <summary>Whole seconds until the next UTC midnight.</summary>
    public static int SecondsToNextUtcDay(DateTime now) =>
        Math.Max(1, (int)Math.Ceiling((now.Date.AddDays(1) - now).TotalSeconds));

    public static MediaProblem TooLarge(long maxBytes) => new(
        "Media.TooLarge",
        $"Pictures must be {maxBytes / 1024} KB or smaller.",
        StatusCodes.Status413PayloadTooLarge);

    public static readonly MediaProblem InvalidRequest = new(
        "Media.InvalidRequest",
        "Send multipart/form-data with exactly one file part named \"file\".",
        StatusCodes.Status400BadRequest);

    public static readonly MediaProblem UnsupportedFormat = new(
        "Media.UnsupportedFormat",
        "Only JPEG, PNG, and WebP pictures are supported.",
        StatusCodes.Status400BadRequest);

    public static readonly MediaProblem Unreadable = new(
        "Media.Unreadable",
        "This picture could not be read. It may be damaged or truncated.",
        StatusCodes.Status400BadRequest);

    public static readonly MediaProblem TooManyPixels = new(
        "Media.TooManyPixels",
        "This picture has too many pixels. Use a smaller image.",
        StatusCodes.Status400BadRequest);

    public static readonly MediaProblem Animated = new(
        "Media.Animated",
        "Animated pictures are not supported. Use a still image.",
        StatusCodes.Status400BadRequest);

    public static readonly MediaProblem CannotOptimize = new(
        "Media.CannotOptimize",
        "This picture cannot be reduced to an acceptable size. Use a simpler or smaller image.",
        StatusCodes.Status400BadRequest);

    public static readonly MediaProblem Busy = new(
        "Media.Busy",
        "Picture processing is busy. Try again shortly.",
        StatusCodes.Status503ServiceUnavailable,
        RetryAfterSeconds: 5);

    public static readonly MediaProblem ProcessingTimeout = new(
        "Media.ProcessingTimeout",
        "Processing this picture took too long. Try a smaller image.",
        StatusCodes.Status503ServiceUnavailable);

    public static readonly MediaProblem StorageUnavailable = new(
        "Media.StorageUnavailable",
        "Picture storage is not available.",
        StatusCodes.Status503ServiceUnavailable);

    public static readonly MediaProblem StorageFailed = new(
        "Media.StorageFailed",
        "The picture could not be stored. Try again later.",
        StatusCodes.Status503ServiceUnavailable);

    public static readonly MediaProblem GlobalCeiling = new(
        "Media.CapacityReached",
        "Picture uploads are temporarily at capacity. Try again later.",
        StatusCodes.Status429TooManyRequests,
        RetryAfterSeconds: 3600);

    public static readonly MediaProblem Disabled = new(
        "Media.Disabled",
        "Picture uploads are temporarily turned off.",
        StatusCodes.Status503ServiceUnavailable);

    public static readonly MediaProblem Withdrawn = new(
        "Media.Withdrawn",
        "This picture was removed while it was being processed.",
        StatusCodes.Status409Conflict);
}

internal sealed class MediaProblemResult(MediaProblem problem) : IResult, Microsoft.AspNetCore.Http.IStatusCodeHttpResult
{
    public MediaProblem Problem => problem;

    public int? StatusCode => problem.StatusCode;

    public Task ExecuteAsync(HttpContext httpContext)
    {
        if (problem.RetryAfterSeconds is int seconds)
        {
            httpContext.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        }

        return Results.Problem(title: problem.Code, detail: problem.Detail, statusCode: problem.StatusCode)
            .ExecuteAsync(httpContext);
    }
}
