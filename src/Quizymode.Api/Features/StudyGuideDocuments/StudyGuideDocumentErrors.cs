using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.StudyGuideDocuments;

/// <summary>Error codes for study guide documents (AC 6.6). Codes are returned as the ProblemDetails title.</summary>
internal static class StudyGuideDocumentErrors
{
    public const string QuotaExceededCode = "StudyGuideDocument.QuotaExceeded";
    public const string DisabledCode = "StudyGuideDocument.Disabled";
    public const string BudgetReachedCode = "StudyGuideDocument.BudgetReached";

    public static readonly Error UnsupportedType = Error.Validation(
        "StudyGuideDocument.UnsupportedType",
        "Only PDF, Word (.docx), PowerPoint (.pptx), and plain text or Markdown files are supported.");

    public static readonly Error Scanned = Error.Validation(
        "StudyGuideDocument.Scanned",
        "This looks like a scan; only PDFs with selectable text are supported for now.");

    public static readonly Error Unreadable = Error.Validation(
        "StudyGuideDocument.Unreadable",
        "This file could not be read. It may be damaged or password-protected.");

    public static readonly Error ExtractionTimeout = Error.Validation(
        "StudyGuideDocument.ExtractionTimeout",
        "Reading this file took too long. Try a smaller file.");

    public static readonly Error Empty = Error.Validation(
        "StudyGuideDocument.Empty",
        "No text was found in this study guide.");

    public static readonly Error FileOrTextRequired = Error.Validation(
        "StudyGuideDocument.FileOrTextRequired",
        "Upload a file or paste text (not both).");

    public static readonly Error ProfanityBlocked = Error.Validation(
        "StudyGuideDocument.ProfanityBlocked",
        "This study guide contains blocked language and could not be uploaded.");

    public static readonly Error InvalidSections = Error.Validation(
        "StudyGuideDocument.InvalidSections",
        "One or more selected sections do not belong to this study guide.");

    public static readonly Error SectionExpired = Error.Validation(
        "StudyGuideDocument.SectionExpired",
        "The text of one or more selected sections has expired. Upload the study guide again.");

    public static readonly Error InvalidCandidates = Error.Validation(
        "StudyGuideDocument.InvalidCandidates",
        "One or more selected questions do not belong to this study guide.");

    public static readonly Error Conflict = Error.Conflict(
        "StudyGuideDocument.Conflict",
        "Another request changed this study guide at the same time. Please try again.");

    public static Error FileTooLarge(int maxBytes) => Error.Validation(
        "StudyGuideDocument.FileTooLarge",
        $"The file must not exceed {maxBytes / (1024 * 1024)} MB.");

    public static Error TooManyPages(int maxPages) => Error.Validation(
        "StudyGuideDocument.TooManyPages",
        $"The study guide must not have more than {maxPages} pages or slides.");

    public static Error TextTooLarge(int maxBytes) => Error.Validation(
        "StudyGuideDocument.TextTooLarge",
        $"The study guide text must not exceed {maxBytes / 1024} KB.");

    public static Error QuotaExceeded(string detail) => new(QuotaExceededCode, detail, ErrorType.Failure);

    public static readonly Error Disabled = new(
        DisabledCode,
        "AI study guide generation is not available right now.",
        ErrorType.Failure);

    public static readonly Error BudgetReached = new(
        BudgetReachedCode,
        "Question generation has reached its monthly limit. Please try again next month.",
        ErrorType.Failure);
}

/// <summary>Maps study guide document failures to HTTP: quota → 429, disabled/budget → 503, otherwise the usual ProblemDetails.</summary>
internal static class StudyGuideDocumentResults
{
    public static IResult Problem(Result result) =>
        result.Error.Code switch
        {
            StudyGuideDocumentErrors.QuotaExceededCode => Results.Problem(
                title: result.Error.Code,
                detail: result.Error.Description,
                statusCode: StatusCodes.Status429TooManyRequests),
            StudyGuideDocumentErrors.DisabledCode or StudyGuideDocumentErrors.BudgetReachedCode => Results.Problem(
                title: result.Error.Code,
                detail: result.Error.Description,
                statusCode: StatusCodes.Status503ServiceUnavailable),
            _ => Quizymode.Api.Shared.Http.CustomResults.Problem(result)
        };
}
