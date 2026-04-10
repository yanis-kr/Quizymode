using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Ideas;

public sealed record IdeaSummaryResponse(
    string Id,
    string Title,
    string Problem,
    string ProposedChange,
    string? TradeOffs,
    string Status,
    string ModerationState,
    string? ModerationNotes,
    string AuthorName,
    string? ReviewedByName,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    DateTime? ReviewedAt,
    int CommentCount,
    int RatingCount,
    double? AverageStars,
    int? MyRating,
    bool CanEdit,
    bool CanDelete,
    bool CanChangeStatus,
    bool CanModerate);

public sealed record IdeaBoardResponse(List<IdeaSummaryResponse> Ideas);

public sealed record IdeaCommentResponse(
    string Id,
    string IdeaId,
    string Text,
    string AuthorName,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    bool CanEdit,
    bool CanDelete);

public sealed record IdeaCommentsResponse(List<IdeaCommentResponse> Comments);

internal static partial class IdeaFeatureSupport
{
    public const string SeederUserId = "seeder";
    public const string SeederDisplayName = "Quizymode";

    public static async Task<List<IdeaSummaryResponse>> BuildSummariesAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        IQueryable<Idea> query,
        CancellationToken cancellationToken)
    {
        List<Idea> ideas = await query.ToListAsync(cancellationToken);
        if (ideas.Count == 0)
        {
            return [];
        }

        List<Guid> ideaIds = ideas.Select(static idea => idea.Id).ToList();

        Dictionary<Guid, int> commentCounts = await db.IdeaComments
            .Where(comment => ideaIds.Contains(comment.IdeaId))
            .GroupBy(comment => comment.IdeaId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Count, cancellationToken);

        List<IdeaRating> ratings = await db.IdeaRatings
            .Where(rating => ideaIds.Contains(rating.IdeaId))
            .ToListAsync(cancellationToken);

        Dictionary<Guid, int> ratingCounts = ratings
            .Where(static rating => rating.Stars.HasValue)
            .GroupBy(static rating => rating.IdeaId)
            .ToDictionary(group => group.Key, group => group.Count());

        Dictionary<Guid, double?> averageRatings = ratings
            .Where(static rating => rating.Stars.HasValue)
            .GroupBy(static rating => rating.IdeaId)
            .ToDictionary(
                group => group.Key,
                group => (double?)Math.Round(group.Average(rating => rating.Stars!.Value), 2));

        Dictionary<Guid, int?> myRatings = [];
        if (userContext.IsAuthenticated && !string.IsNullOrWhiteSpace(userContext.UserId))
        {
            myRatings = ratings
                .Where(rating => string.Equals(rating.CreatedBy, userContext.UserId, StringComparison.Ordinal))
                .ToDictionary(rating => rating.IdeaId, rating => rating.Stars);
        }

        Dictionary<string, string> displayNames = await ResolveDisplayNamesAsync(
            db,
            ideas.Select(static idea => idea.CreatedBy)
                .Concat(ideas.Where(static idea => !string.IsNullOrWhiteSpace(idea.ReviewedBy)).Select(idea => idea.ReviewedBy!)),
            cancellationToken);

        return ideas
            .Select(idea => new IdeaSummaryResponse(
                idea.Id.ToString(),
                idea.Title,
                idea.Problem,
                idea.ProposedChange,
                idea.TradeOffs,
                ToStatusString(idea.Status),
                ToModerationStateString(idea.ModerationState),
                idea.ModerationNotes,
                GetDisplayName(idea.CreatedBy, displayNames),
                string.IsNullOrWhiteSpace(idea.ReviewedBy) ? null : GetDisplayName(idea.ReviewedBy, displayNames),
                idea.CreatedAt,
                idea.UpdatedAt,
                idea.ReviewedAt,
                commentCounts.GetValueOrDefault(idea.Id),
                ratingCounts.GetValueOrDefault(idea.Id),
                averageRatings.GetValueOrDefault(idea.Id),
                myRatings.GetValueOrDefault(idea.Id),
                CanEditIdea(idea, userContext),
                CanDeleteIdea(idea, userContext),
                userContext.IsAdmin,
                userContext.IsAdmin))
            .ToList();
    }

    public static async Task<List<IdeaCommentResponse>> BuildCommentsAsync(
        ApplicationDbContext db,
        IUserContext userContext,
        IQueryable<IdeaComment> query,
        CancellationToken cancellationToken)
    {
        List<IdeaComment> comments = await query.ToListAsync(cancellationToken);
        if (comments.Count == 0)
        {
            return [];
        }

        Dictionary<string, string> displayNames = await ResolveDisplayNamesAsync(
            db,
            comments.Select(static comment => comment.CreatedBy),
            cancellationToken);

        return comments
            .Select(comment => new IdeaCommentResponse(
                comment.Id.ToString(),
                comment.IdeaId.ToString(),
                comment.Text,
                GetDisplayName(comment.CreatedBy, displayNames),
                comment.CreatedAt,
                comment.UpdatedAt,
                string.Equals(comment.CreatedBy, userContext.UserId, StringComparison.Ordinal),
                string.Equals(comment.CreatedBy, userContext.UserId, StringComparison.Ordinal)))
            .ToList();
    }

    public static string NormalizeInput(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        string normalized = value.Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n');

        string[] lines = normalized.Split('\n');
        List<string> collapsedLines = [];
        bool previousLineBlank = false;
        foreach (string line in lines)
        {
            string collapsed = MultiWhitespaceRegex().Replace(line.Trim(), " ");
            bool isBlank = string.IsNullOrWhiteSpace(collapsed);
            if (isBlank)
            {
                if (!previousLineBlank)
                {
                    collapsedLines.Add(string.Empty);
                }

                previousLineBlank = true;
                continue;
            }

            collapsedLines.Add(collapsed);
            previousLineBlank = false;
        }

        return string.Join('\n', collapsedLines).Trim();
    }

    public static string NormalizeForComparison(string? value) =>
        NormalizeInput(value).ToLowerInvariant();

    public static int CountMeaningfulCharacters(string? value) =>
        NormalizeInput(value).Count(char.IsLetterOrDigit);

    public static bool TryParseStatus(string value, out IdeaStatus status)
    {
        status = default;

        string normalized = value.Trim().Replace(" ", string.Empty, StringComparison.Ordinal);
        return Enum.TryParse(normalized, ignoreCase: true, out status);
    }

    public static string ToStatusString(IdeaStatus status) =>
        status switch
        {
            IdeaStatus.InProgress => "In Progress",
            _ => status.ToString()
        };

    public static string ToModerationStateString(IdeaModerationState state) =>
        state.ToString();

    public static bool CanEditIdea(Idea idea, IUserContext userContext) =>
        userContext.IsAdmin || string.Equals(idea.CreatedBy, userContext.UserId, StringComparison.Ordinal);

    public static bool CanDeleteIdea(Idea idea, IUserContext userContext) =>
        CanEditIdea(idea, userContext);

    public static bool IsExactDuplicate(
        IEnumerable<Idea> existingIdeas,
        string title,
        string problem,
        string proposedChange,
        Guid? excludeId = null)
    {
        string normalizedTitle = NormalizeForComparison(title);
        string normalizedProblem = NormalizeForComparison(problem);
        string normalizedProposedChange = NormalizeForComparison(proposedChange);

        return existingIdeas.Any(idea =>
            (!excludeId.HasValue || idea.Id != excludeId.Value) &&
            string.Equals(NormalizeForComparison(idea.Title), normalizedTitle, StringComparison.Ordinal) &&
            string.Equals(NormalizeForComparison(idea.Problem), normalizedProblem, StringComparison.Ordinal) &&
            string.Equals(NormalizeForComparison(idea.ProposedChange), normalizedProposedChange, StringComparison.Ordinal));
    }

    public static string GetDisplayName(string? userId, IReadOnlyDictionary<string, string> displayNames)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return "Unknown";
        }

        if (displayNames.TryGetValue(userId, out string? displayName) && !string.IsNullOrWhiteSpace(displayName))
        {
            return displayName;
        }

        return userId;
    }

    private static async Task<Dictionary<string, string>> ResolveDisplayNamesAsync(
        ApplicationDbContext db,
        IEnumerable<string> userIds,
        CancellationToken cancellationToken)
    {
        HashSet<string> distinctUserIds = userIds
            .Where(static userId => !string.IsNullOrWhiteSpace(userId))
            .ToHashSet(StringComparer.Ordinal);

        Dictionary<string, string> displayNames = new(StringComparer.Ordinal)
        {
            [SeederUserId] = SeederDisplayName
        };

        List<Guid> parsedUserIds = distinctUserIds
            .Select(userId => Guid.TryParse(userId, out Guid parsedId) ? parsedId : Guid.Empty)
            .Where(static parsedId => parsedId != Guid.Empty)
            .ToList();

        if (parsedUserIds.Count == 0)
        {
            return displayNames;
        }

        List<User> users = await db.Users
            .Where(user => parsedUserIds.Contains(user.Id))
            .ToListAsync(cancellationToken);

        foreach (User user in users)
        {
            string displayName = !string.IsNullOrWhiteSpace(user.Name)
                ? user.Name
                : user.Email ?? user.Id.ToString();
            displayNames[user.Id.ToString()] = displayName;
        }

        return displayNames;
    }

    [GeneratedRegex(@"\s+", RegexOptions.Compiled)]
    private static partial Regex MultiWhitespaceRegex();
}
