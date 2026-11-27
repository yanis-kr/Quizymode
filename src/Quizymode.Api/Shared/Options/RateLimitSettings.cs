namespace Quizymode.Api.Shared.Options;

/// <summary>Fixed-window limits (AC 17, #904). In memory per API instance; each value is configurable.</summary>
internal sealed class RateLimitSettings
{
    public const string SectionName = "RateLimits";

    public RateLimitRule Global { get; set; } = new() { PermitLimit = 2400, WindowSeconds = 60 };

    public RateLimitRule PageViews { get; set; } = new() { PermitLimit = 300, WindowSeconds = 600 };

    public RateLimitRule ContentWrites { get; set; } = new() { PermitLimit = 120, WindowSeconds = 600 };

    public RateLimitRule LargeItemPages { get; set; } = new() { PermitLimit = 60, WindowSeconds = 600 };

    public RateLimitRule ItemExport { get; set; } = new() { PermitLimit = 10, WindowSeconds = 600 };

    public bool IsValid() =>
        new[] { Global, PageViews, ContentWrites, LargeItemPages, ItemExport }
            .All(rule => rule is { PermitLimit: > 0, WindowSeconds: > 0 });
}

internal sealed class RateLimitRule
{
    public int PermitLimit { get; set; }

    public int WindowSeconds { get; set; }
}
