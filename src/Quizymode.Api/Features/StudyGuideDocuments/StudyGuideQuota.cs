using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideDocuments;

/// <summary>A user's study guide section quota at a point in time.</summary>
internal sealed record StudyGuideQuotaSnapshot(
    StudyGuideTier Tier,
    int DailyLimit,
    int DailyUsed,
    int MonthlyLimit,
    int MonthlyUsed)
{
    public int RemainingToday => Math.Max(0, Math.Min(DailyLimit - DailyUsed, MonthlyLimit - MonthlyUsed));

    public StudyGuideDocumentContracts.Quota ToResponse() =>
        new(Tier.ToString(), DailyLimit, DailyUsed, MonthlyLimit, MonthlyUsed, RemainingToday);
}

/// <summary>
/// Per-user tier and quota (AC 6.6): premium when the admin-set user setting <c>StudyGuidePremium</c> is "true";
/// limits come from <see cref="StudyGuideGenerationOptions"/> unless overridden by <c>StudyGuideDailySections</c> /
/// <c>StudyGuideMonthlySections</c>. Usage is the sum of charge costs in the current UTC day / UTC calendar month.
/// Also computes the global monthly budget usage (generations queued this UTC month).
/// </summary>
internal static class StudyGuideQuota
{
    public static DateTime DayStart(DateTime nowUtc) => new(nowUtc.Year, nowUtc.Month, nowUtc.Day, 0, 0, 0, DateTimeKind.Utc);

    public static DateTime MonthStart(DateTime nowUtc) => new(nowUtc.Year, nowUtc.Month, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>The caller's tier: premium only when the admin-set <c>StudyGuidePremium</c> user setting is "true".</summary>
    public static async Task<StudyGuideTier> GetTierAsync(ApplicationDbContext db, string userId, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userId, out Guid userGuid))
        {
            return StudyGuideTier.Free;
        }

        string? value = await db.UserSettings
            .AsNoTracking()
            .Where(setting => setting.UserId == userGuid && setting.Key == StudyGuideSettingKeys.Premium)
            .Select(setting => setting.Value)
            .FirstOrDefaultAsync(cancellationToken);
        return StudyGuideSettingKeys.IsPremium(value) ? StudyGuideTier.Premium : StudyGuideTier.Free;
    }

    public static async Task<StudyGuideQuotaSnapshot> GetAsync(
        ApplicationDbContext db,
        string userId,
        StudyGuideGenerationOptions options,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        Dictionary<string, string> settings = new(StringComparer.OrdinalIgnoreCase);
        if (Guid.TryParse(userId, out Guid userGuid))
        {
            string[] keys = [StudyGuideSettingKeys.Premium, StudyGuideSettingKeys.DailySections, StudyGuideSettingKeys.MonthlySections];
            List<UserSetting> rows = await db.UserSettings
                .AsNoTracking()
                .Where(setting => setting.UserId == userGuid && keys.Contains(setting.Key))
                .ToListAsync(cancellationToken);
            foreach (UserSetting row in rows)
            {
                settings[row.Key] = row.Value;
            }
        }

        StudyGuideTier tier = StudyGuideSettingKeys.IsPremium(settings.GetValueOrDefault(StudyGuideSettingKeys.Premium))
            ? StudyGuideTier.Premium
            : StudyGuideTier.Free;

        int dailyLimit = StudyGuideSettingKeys.ParseOverride(settings.GetValueOrDefault(StudyGuideSettingKeys.DailySections))
            ?? (tier == StudyGuideTier.Premium ? options.PremiumDailySections : options.FreeDailySections);
        int monthlyLimit = StudyGuideSettingKeys.ParseOverride(settings.GetValueOrDefault(StudyGuideSettingKeys.MonthlySections))
            ?? (tier == StudyGuideTier.Premium ? options.PremiumMonthlySections : options.FreeMonthlySections);

        DateTime dayStart = DayStart(nowUtc);
        DateTime monthStart = MonthStart(nowUtc);
        List<(DateTime ChargedUtc, int Cost)> charges = (await db.StudyGuideQuotaCharges
                .AsNoTracking()
                .Where(charge => charge.UserId == userId && charge.ChargedUtc >= monthStart)
                .Select(charge => new { charge.ChargedUtc, charge.Cost })
                .ToListAsync(cancellationToken))
            .Select(charge => (charge.ChargedUtc, charge.Cost))
            .ToList();

        int monthlyUsed = charges.Sum(charge => charge.Cost);
        int dailyUsed = charges.Where(charge => charge.ChargedUtc >= dayStart).Sum(charge => charge.Cost);
        return new StudyGuideQuotaSnapshot(tier, Math.Max(0, dailyLimit), dailyUsed, Math.Max(0, monthlyLimit), monthlyUsed);
    }

    /// <summary>Section generations queued (created or retried) in the current UTC month across all users.</summary>
    public static Task<int> GlobalMonthlyUsedAsync(ApplicationDbContext db, DateTime nowUtc, CancellationToken cancellationToken)
    {
        DateTime monthStart = MonthStart(nowUtc);
        return db.SectionGenerations.CountAsync(generation => generation.QueuedUtc >= monthStart, cancellationToken);
    }
}
