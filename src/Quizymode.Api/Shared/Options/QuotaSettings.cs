namespace Quizymode.Api.Shared.Options;

/// <summary>Daily creation quotas per account, per UTC day (AC 17, #904). Admins are exempt.</summary>
public sealed class QuotaSettings
{
    public const string SectionName = "Quotas";

    public int ItemsPerDay { get; set; } = 500;

    public int CollectionsPerDay { get; set; } = 50;

    public int CommentsPerDay { get; set; } = 100;

    public bool IsValid() => ItemsPerDay > 0 && CollectionsPerDay > 0 && CommentsPerDay > 0;
}
