using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Daily creation quotas (AC 17, #904). A quota counts the caller's stored rows created since 00:00 UTC, so it holds across
/// restarts and deleting a row frees its place. Admins are exempt. Null settings mean the default limits, never "off".
/// A count is race-free only inside a transaction that holds a lock: item paths hold the lock taken by
/// <see cref="ItemImageSubmission.BeginAsync"/>; the collection and comment checks take a per-user lock themselves.
/// Lock order is always the item lock first, then the collection lock.
/// </summary>
internal static class CreationQuota
{
    private const string CodePrefix = "Quota.";
    public const string ItemsCode = "Quota.ItemsPerDay";
    public const string CollectionsCode = "Quota.CollectionsPerDay";
    public const string CommentsCode = "Quota.CommentsPerDay";

    public static bool IsQuotaError(Error error) => error.Code.StartsWith(CodePrefix, StringComparison.Ordinal);

    /// <summary>Whole seconds until the next UTC midnight, when the daily quotas reset.</summary>
    public static int SecondsToNextUtcDay(DateTime now) =>
        Math.Max(1, (int)Math.Ceiling((now.Date.AddDays(1) - now).TotalSeconds));

    /// <summary>Starts a transaction unless the database is not relational or the caller already holds one.</summary>
    public static async Task<IDbContextTransaction?> BeginAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        if (!db.Database.IsRelational() || db.Database.CurrentTransaction is not null)
        {
            return null;
        }

        try
        {
            return await db.Database.BeginTransactionAsync(cancellationToken);
        }
        catch (NotSupportedException)
        {
            return null;
        }
    }

    public static async Task<Error?> CheckItemsAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        int requested,
        QuotaSettings? settings,
        DateTime? nowUtc,
        CancellationToken cancellationToken)
    {
        if (userContext.IsAdmin)
        {
            return null;
        }

        string? userId = userContext.UserId;
        DateTime today = StartOfDay(nowUtc);
        int used = await db.Items.CountAsync(item => item.CreatedBy == userId && item.CreatedAt >= today, cancellationToken);
        return Evaluate(ItemsCode, "item", (settings ?? new QuotaSettings()).ItemsPerDay, used, requested);
    }

    /// <summary>The automatically created default collection is not counted.</summary>
    public static async Task<Error?> CheckCollectionsAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        int requested,
        QuotaSettings? settings,
        DateTime? nowUtc,
        CancellationToken cancellationToken)
    {
        if (userContext.IsAdmin)
        {
            return null;
        }

        string? userId = userContext.UserId;
        await LockAsync(db, "collections", userId, cancellationToken);
        DateTime today = StartOfDay(nowUtc);
        int used = await db.Collections.CountAsync(
            collection => collection.CreatedBy == userId && !collection.IsAutoCreated && collection.CreatedAt >= today,
            cancellationToken);
        return Evaluate(CollectionsCode, "collection", (settings ?? new QuotaSettings()).CollectionsPerDay, used, requested);
    }

    public static async Task<Error?> CheckCommentsAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        int requested,
        QuotaSettings? settings,
        DateTime? nowUtc,
        CancellationToken cancellationToken)
    {
        if (userContext.IsAdmin)
        {
            return null;
        }

        string? userId = userContext.UserId;
        await LockAsync(db, "comments", userId, cancellationToken);
        DateTime today = StartOfDay(nowUtc);
        int used = await db.Comments.CountAsync(comment => comment.CreatedBy == userId && comment.CreatedAt >= today, cancellationToken);
        return Evaluate(CommentsCode, "comment", (settings ?? new QuotaSettings()).CommentsPerDay, used, requested);
    }

    private static DateTime StartOfDay(DateTime? nowUtc) =>
        DateTime.SpecifyKind((nowUtc ?? DateTime.UtcNow).Date, DateTimeKind.Utc);

    private static async Task LockAsync(ApplicationDbContext db, string kind, string? userId, CancellationToken cancellationToken)
    {
        if (!db.Database.IsNpgsql() || db.Database.CurrentTransaction is null)
        {
            return;
        }

        string lockKey = $"create-quota:{kind}:{userId}";
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({lockKey}))", cancellationToken);
    }

    private static Error? Evaluate(string code, string noun, int limit, int used, int requested) =>
        (long)used + requested <= limit
            ? null
            : Error.Validation(
                code,
                $"Daily {noun} limit reached: you can create {limit} {noun}s per day (UTC). " +
                $"Already created today: {used}. Requested now: {requested}. The limit resets at midnight UTC.");
}
