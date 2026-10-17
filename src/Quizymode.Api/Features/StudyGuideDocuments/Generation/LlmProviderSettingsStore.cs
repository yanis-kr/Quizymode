using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

/// <summary>
/// Reads the single admin routing row (AC 5.12), seeding defaults on first read: models DeepSeek <c>deepseek-flash</c>,
/// OpenAI <c>gpt-5-nano</c>, Gemini <c>gemini-2.5-flash-lite</c>; free route Gemini → OpenAI → DeepSeek; premium route
/// DeepSeek → OpenAI → Gemini.
/// </summary>
internal static class LlmProviderSettingsStore
{
    public const string DefaultDeepSeekModel = "deepseek-flash";
    public const string DefaultOpenAiModel = "gpt-5-nano";
    public const string DefaultGeminiModel = "gemini-2.5-flash-lite";

    public static readonly IReadOnlyList<string> DefaultRouteFree = [LlmVendors.Gemini, LlmVendors.OpenAI, LlmVendors.DeepSeek];
    public static readonly IReadOnlyList<string> DefaultRoutePremium = [LlmVendors.DeepSeek, LlmVendors.OpenAI, LlmVendors.Gemini];

    public static async Task<LlmProviderSettings> GetOrCreateAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        LlmProviderSettings? settings = await db.LlmProviderSettings
            .FirstOrDefaultAsync(row => row.Id == LlmProviderSettings.SingletonId, cancellationToken);
        if (settings is not null)
        {
            return settings;
        }

        settings = CreateDefaults(DateTime.UtcNow);
        db.LlmProviderSettings.Add(settings);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Another request seeded the row first.
            db.Entry(settings).State = EntityState.Detached;
            settings = await db.LlmProviderSettings.FirstAsync(row => row.Id == LlmProviderSettings.SingletonId, cancellationToken);
        }

        return settings;
    }

    public static LlmProviderSettings CreateDefaults(DateTime nowUtc) =>
        new()
        {
            Id = LlmProviderSettings.SingletonId,
            DeepSeekModel = DefaultDeepSeekModel,
            OpenAiModel = DefaultOpenAiModel,
            GeminiModel = DefaultGeminiModel,
            RouteFree = FormatRoute(DefaultRouteFree),
            RoutePremium = FormatRoute(DefaultRoutePremium),
            UpdatedUtc = nowUtc
        };

    public static string ModelFor(LlmProviderSettings settings, string vendor) =>
        vendor switch
        {
            LlmVendors.DeepSeek => settings.DeepSeekModel,
            LlmVendors.OpenAI => settings.OpenAiModel,
            LlmVendors.Gemini => settings.GeminiModel,
            _ => string.Empty
        };

    public static void SetModel(LlmProviderSettings settings, string vendor, string model)
    {
        switch (vendor)
        {
            case LlmVendors.DeepSeek:
                settings.DeepSeekModel = model;
                break;
            case LlmVendors.OpenAI:
                settings.OpenAiModel = model;
                break;
            case LlmVendors.Gemini:
                settings.GeminiModel = model;
                break;
        }
    }

    public static List<string> RouteFor(LlmProviderSettings settings, StudyGuideTier tier) =>
        ParseRoute(tier == StudyGuideTier.Premium ? settings.RoutePremium : settings.RouteFree);

    public static List<string> ParseRoute(string? route) =>
        (route ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(LlmVendors.Normalize)
            .Where(vendor => vendor is not null)
            .Select(vendor => vendor!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    public static string FormatRoute(IEnumerable<string> vendors) => string.Join(",", vendors);
}
