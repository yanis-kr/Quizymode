namespace Quizymode.Api.Shared.Models;

/// <summary>
/// The allowlist of engagement events and the optional fields each one may carry. Anything not
/// listed here is rejected, which keeps the event table from turning into a free-form payload store.
/// </summary>
public static class AnalyticsEventCatalog
{
    public const string QuickQuizStarted = "quick_quiz_started";
    public const string QuizCompleted = "quiz_completed";
    public const string SignupPromptViewed = "signup_prompt_viewed";
    public const string SignupPromptClicked = "signup_prompt_clicked";
    public const string SignupFormStarted = "signup_form_started";
    public const string SignupSubmitted = "signup_submitted";
    public const string SignupConfirmationShown = "signup_confirmation_shown";
    public const string SignupConfirmed = "signup_confirmed";
    public const string SignInCompleted = "sign_in_completed";
    public const string GuestStateImported = "guest_state_imported";

    // Study engagement (ANALYTICS-007). A quiz run starts with QuickQuizStarted and ends with QuizCompleted.
    public const string QuestionAnswered = "question_answered";
    public const string FlashcardsStarted = "flashcards_started";
    public const string FlashcardRevealed = "flashcard_revealed";
    public const string FlashcardGraded = "flashcard_graded";
    public const string QuizResultShared = "quiz_result_shared";

    /// <summary>Optional fields an event may carry beyond name, session, path, and context.</summary>
    [Flags]
    public enum EventFields
    {
        None = 0,
        RunId = 1,
        Score = 2,
        Total = 4,
        ItemId = 8,
        Position = 16,
        IsCorrect = 32
    }

    /// <param name="Allowed">Fields the event may carry; any other optional field is a validation error.</param>
    /// <param name="Required">Fields the event must carry.</param>
    public sealed record EventRule(EventFields Allowed, EventFields Required);

    public static readonly IReadOnlyDictionary<string, EventRule> Rules = new Dictionary<string, EventRule>(StringComparer.Ordinal)
    {
        // Run-scoped: the run id makes the server-side dedupe key, so one run stores one start and one completion.
        [QuickQuizStarted] = new(EventFields.RunId | EventFields.Total, EventFields.RunId),
        [QuizCompleted] = new(EventFields.RunId | EventFields.Score | EventFields.Total, EventFields.RunId | EventFields.Score | EventFields.Total),
        [SignupPromptViewed] = new(EventFields.None, EventFields.None),
        [SignupPromptClicked] = new(EventFields.None, EventFields.None),
        [SignupFormStarted] = new(EventFields.None, EventFields.None),
        [SignupSubmitted] = new(EventFields.None, EventFields.None),
        [SignupConfirmationShown] = new(EventFields.None, EventFields.None),
        [SignupConfirmed] = new(EventFields.None, EventFields.None),
        [SignInCompleted] = new(EventFields.None, EventFields.None),
        [GuestStateImported] = new(EventFields.None, EventFields.None),
        // Item-level: the dedupe key adds the item id, so one run stores one answer or reveal per item.
        [QuestionAnswered] = new(
            EventFields.RunId | EventFields.ItemId | EventFields.Position | EventFields.IsCorrect,
            EventFields.RunId | EventFields.ItemId | EventFields.Position | EventFields.IsCorrect),
        [FlashcardsStarted] = new(EventFields.RunId | EventFields.Total, EventFields.RunId),
        [FlashcardRevealed] = new(
            EventFields.RunId | EventFields.ItemId | EventFields.Position,
            EventFields.RunId | EventFields.ItemId | EventFields.Position),
        // Self-graded flashcard (#251): IsCorrect is true for "Got it". Not a funnel step.
        [FlashcardGraded] = new(
            EventFields.RunId | EventFields.ItemId | EventFields.Position | EventFields.IsCorrect,
            EventFields.RunId | EventFields.ItemId | EventFields.Position | EventFields.IsCorrect),
        // A completed run's result was shared (#253): one per run. Not a funnel step.
        [QuizResultShared] = new(
            EventFields.RunId | EventFields.Score | EventFields.Total,
            EventFields.RunId | EventFields.Score | EventFields.Total)
    };

    /// <summary>The initial conversion funnel, in step order, as reported to admins.</summary>
    public static readonly IReadOnlyList<string> FunnelSteps =
    [
        QuickQuizStarted,
        QuizCompleted,
        SignupPromptViewed,
        SignupPromptClicked,
        SignupFormStarted,
        SignupSubmitted,
        SignupConfirmationShown,
        SignupConfirmed,
        SignInCompleted,
        GuestStateImported
    ];

    public static readonly IReadOnlySet<string> ContextTypes = new HashSet<string>(StringComparer.Ordinal)
    {
        "auth",
        "category",
        "collection",
        "daily",
        "flashcards",
        "home",
        "learn",
        "quiz",
        "review"
    };

    public const int MaxScoreOrTotal = 500;
}
