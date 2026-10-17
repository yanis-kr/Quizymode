namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

/// <summary>Known OpenAI-compatible vendors (canonical names as stored in routes and attempt logs).</summary>
internal static class LlmVendors
{
    public const string DeepSeek = "DeepSeek";
    public const string OpenAI = "OpenAI";
    public const string Gemini = "Gemini";

    public static readonly IReadOnlyList<string> All = [DeepSeek, OpenAI, Gemini];

    /// <summary>Canonical vendor name for a case-insensitive match, or null when unknown.</summary>
    public static string? Normalize(string? value) =>
        All.FirstOrDefault(vendor => string.Equals(vendor, value?.Trim(), StringComparison.OrdinalIgnoreCase));
}

/// <summary>Base URL and API key for one vendor. The key is never logged, returned, or included in <see cref="ToString"/>.</summary>
internal sealed class LlmVendorEndpoint(string vendor, string baseUrl, string apiKey)
{
    public string Vendor { get; } = vendor;

    public string BaseUrl { get; } = baseUrl;

    public string ApiKey { get; } = apiKey;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);

    public override string ToString() => $"{Vendor} ({BaseUrl})";
}

internal interface ILlmVendorRegistry
{
    LlmVendorEndpoint Get(string vendor);

    bool IsConfigured(string vendor);

    bool AnyConfigured { get; }
}

/// <summary>
/// Vendor endpoints from configuration only (never the database): <c>DeepSeek:ApiKey</c> / env <c>DEEPSEEK_API_KEY</c>,
/// <c>OpenAI:ApiKey</c> / <c>OPENAI_API_KEY</c>, <c>Gemini:ApiKey</c> / <c>GEMINI_API_KEY</c>; base URLs default to the
/// vendors' OpenAI-compatible endpoints and can be overridden with <c>{Vendor}:BaseUrl</c>.
/// </summary>
internal sealed class LlmVendorRegistry : ILlmVendorRegistry
{
    private readonly Dictionary<string, LlmVendorEndpoint> _endpoints;

    public LlmVendorRegistry(IConfiguration configuration)
    {
        _endpoints = new Dictionary<string, LlmVendorEndpoint>(StringComparer.OrdinalIgnoreCase)
        {
            [LlmVendors.DeepSeek] = Read(configuration, LlmVendors.DeepSeek, "DeepSeek", "DEEPSEEK_API_KEY", "https://api.deepseek.com"),
            [LlmVendors.OpenAI] = Read(configuration, LlmVendors.OpenAI, "OpenAI", "OPENAI_API_KEY", "https://api.openai.com/v1"),
            [LlmVendors.Gemini] = Read(configuration, LlmVendors.Gemini, "Gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai")
        };
    }

    public LlmVendorEndpoint Get(string vendor) =>
        _endpoints.TryGetValue(vendor, out LlmVendorEndpoint? endpoint)
            ? endpoint
            : new LlmVendorEndpoint(vendor, string.Empty, string.Empty);

    public bool IsConfigured(string vendor) => Get(vendor).IsConfigured;

    public bool AnyConfigured => _endpoints.Values.Any(endpoint => endpoint.IsConfigured);

    private static LlmVendorEndpoint Read(IConfiguration configuration, string vendor, string section, string environmentVariable, string defaultBaseUrl)
    {
        string? apiKey = configuration[$"{section}:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            apiKey = configuration[environmentVariable];
        }

        string? baseUrl = configuration[$"{section}:BaseUrl"];
        return new LlmVendorEndpoint(
            vendor,
            string.IsNullOrWhiteSpace(baseUrl) ? defaultBaseUrl : baseUrl.Trim(),
            apiKey?.Trim() ?? string.Empty);
    }
}
