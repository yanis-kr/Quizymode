namespace Quizymode.Api.Shared.Models;

public static class FeedbackStatus
{
    public const string New = "New";
    public const string Reviewed = "Reviewed";
    public const string Archived = "Archived";

    public static readonly string[] All = [New, Reviewed, Archived];

    public static string? Normalize(string? value) =>
        All.FirstOrDefault(status => string.Equals(status, value?.Trim(), StringComparison.OrdinalIgnoreCase));
}
