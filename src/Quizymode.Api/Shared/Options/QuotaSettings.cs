namespace Quizymode.Api.Shared.Options;

/// <summary>Daily creation quotas per account, per UTC day (AC 17, #904). Admins are exempt.</summary>
public sealed class QuotaSettings
{
    public const string SectionName = "Quotas";

    public int ItemsPerDay { get; set; } = 500;

    public int CollectionsPerDay { get; set; } = 50;

    public int CommentsPerDay { get; set; } = 100;

    /// <summary>For work saved on an admin's behalf under a non-admin context, such as the study guide auto-save.</summary>
    public static QuotaSettings Unlimited { get; } = new()
    {
        ItemsPerDay = int.MaxValue,
        CollectionsPerDay = int.MaxValue,
        CommentsPerDay = int.MaxValue
    };

    public bool IsValid() => ItemsPerDay > 0 && CollectionsPerDay > 0 && CommentsPerDay > 0;
}
