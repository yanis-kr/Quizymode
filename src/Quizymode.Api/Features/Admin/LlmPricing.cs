using System.Globalization;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Optional per-model prices for the admin usage report (AC 5.12.7), read from configuration as
/// <c>LlmPricing:{model}:InputPerMTok</c> and <c>LlmPricing:{model}:OutputPerMTok</c> (USD per million tokens). Put them in
/// appsettings/JSON: environment-variable keys cannot hold model names containing '-' and '.' comfortably, and a model name
/// containing ':' can never be priced because ':' is the configuration path separator. Both prices must be present, parse
/// as non-negative invariant decimals, or the model has no estimate (null).
/// </summary>
internal static class LlmPricing
{
    public const string SectionName = "LlmPricing";

    public static decimal? EstimateCostUsd(IConfiguration configuration, string model, long inputTokens, long outputTokens)
    {
        if (string.IsNullOrWhiteSpace(model) || model.Contains(':'))
        {
            return null;
        }

        IConfigurationSection section = configuration.GetSection($"{SectionName}:{model}");
        decimal? inputPrice = ParsePrice(section["InputPerMTok"]);
        decimal? outputPrice = ParsePrice(section["OutputPerMTok"]);
        if (inputPrice is null || outputPrice is null)
        {
            return null;
        }

        decimal cost = (inputTokens / 1_000_000m * inputPrice.Value) + (outputTokens / 1_000_000m * outputPrice.Value);
        return Math.Round(cost, 4, MidpointRounding.AwayFromZero);
    }

    private static decimal? ParsePrice(string? value) =>
        decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out decimal price) && price >= 0
            ? price
            : null;
}
