namespace Quizymode.Api.Shared.Models;

public enum StudyGuideUploadStatus
{
    Pending = 0,
    Completed = 1,
    Failed = 2
}

/// <summary>
/// Retired in #240: the one-shot upload flow no longer exists; the table is kept for history and existing
/// <see cref="Item.UploadId"/> references. Formerly a pasted study guide (up to 10 KB) queued for one-shot AI question generation.
/// Processed in-process by the study guide upload worker; the generated questions stay here until the
/// owner reviews and accepts them, at which point private items are created with <see cref="Item.UploadId"/> = <see cref="Id"/>.
/// </summary>
public sealed class StudyGuideUpload
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = string.Empty;

    /// <summary>Lowercase hex SHA-256 of the normalized input text; unique per user for duplicate detection.</summary>
    public string TextHash { get; set; } = string.Empty;

    public string InputText { get; set; } = string.Empty;

    public string CategoryName { get; set; } = string.Empty;

    public string NavigationKeyword1 { get; set; } = string.Empty;

    public string NavigationKeyword2 { get; set; } = string.Empty;

    /// <summary>JSON array of optional extra keywords applied to every generated item.</summary>
    public string? KeywordsJson { get; set; }

    public StudyGuideUploadStatus Status { get; set; }

    /// <summary>JSON array of validated generated questions (set when Completed).</summary>
    public string? GeneratedQuestionsJson { get; set; }

    /// <summary>User-safe failure reason (set when Failed).</summary>
    public string? Error { get; set; }

    public int Attempts { get; set; }

    public DateTime CreatedUtc { get; set; }

    public DateTime UpdatedUtc { get; set; }

    public DateTime? CompletedUtc { get; set; }

    /// <summary>When the owner accepted the questions and items were created.</summary>
    public DateTime? AcceptedUtc { get; set; }

    public int? CreatedItemCount { get; set; }
}
