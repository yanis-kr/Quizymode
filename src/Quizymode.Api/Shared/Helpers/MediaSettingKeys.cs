using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Admin-only per-account picture quota overrides (AC 3.28.7). A value replaces the configured per-owner limit for that
/// account (<c>0</c> blocks the account, <c>""</c> clears the override); the global ceilings still apply. Users cannot set
/// these keys themselves (privilege escalation), so the self-service settings endpoint rejects them.
/// </summary>
internal static class MediaSettingKeys
{
    public const string UploadsPerHour = "MediaUploadsPerHour";
    public const string UploadsPerDay = "MediaUploadsPerDay";
    public const string PendingReviewItems = "MediaPendingReviewItems";
    public const string RetainedBytes = "MediaRetainedBytes";
    public const string AdvisoryOwnerDailyCalls = "MediaAdvisoryOwnerDailyCalls";

    public const int MaxCount = 200;
    public const long MaxBytes = 200L * 1024 * 1024;
    public const int MaxAdvisoryCalls = 100;

    private static readonly string[] Known = [UploadsPerHour, UploadsPerDay, PendingReviewItems, RetainedBytes, AdvisoryOwnerDailyCalls];

    public static readonly IReadOnlySet<string> AdminOnly = new HashSet<string>(Known, StringComparer.OrdinalIgnoreCase);

    /// <summary>Null when the value is valid for the key (or the key is not a media key); otherwise an error message.</summary>
    public static string? Validate(string key, string? value)
    {
        if (!AdminOnly.Contains(key))
        {
            return null;
        }

        string trimmed = value?.Trim() ?? string.Empty;
        long max = string.Equals(key, RetainedBytes, StringComparison.OrdinalIgnoreCase) ? MaxBytes
            : string.Equals(key, AdvisoryOwnerDailyCalls, StringComparison.OrdinalIgnoreCase) ? MaxAdvisoryCalls
            : MaxCount;
        return trimmed.Length == 0 ||
               (long.TryParse(trimmed, NumberStyles.None, CultureInfo.InvariantCulture, out long number) && number <= max)
            ? null
            : $"{key} must be a whole number from 0 to {max}, or empty to use the default.";
    }

    public static string Canonicalize(string key) =>
        AdminOnly.Contains(key) ? Known.First(known => string.Equals(known, key, StringComparison.OrdinalIgnoreCase)) : key;

    /// <summary>Per-owner override values keyed by canonical key; absent, empty or invalid values are omitted.</summary>
    public static async Task<Dictionary<string, long>> LoadAsync(ApplicationDbContext db, string owner, CancellationToken ct)
    {
        Dictionary<string, long> result = [];
        if (!Guid.TryParse(owner, out Guid userId))
        {
            return result;
        }

        List<Models.UserSetting> rows = await db.UserSettings.AsNoTracking()
            .Where(x => x.UserId == userId && Known.Contains(x.Key))
            .ToListAsync(ct);
        foreach (Models.UserSetting row in rows)
        {
            if (Validate(row.Key, row.Value) is null && long.TryParse(row.Value.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out long number))
            {
                result[row.Key] = number;
            }
        }

        return result;
    }

    public static int Count(Dictionary<string, long> overrides, string key, int fallback) =>
        overrides.TryGetValue(key, out long value) ? (int)value : fallback;

    public static long Bytes(Dictionary<string, long> overrides, string key, long fallback) =>
        overrides.TryGetValue(key, out long value) ? value : fallback;
}
