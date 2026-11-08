using System.Text.RegularExpressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideDocuments;

/// <summary>
/// POST /study-guides/documents/{id}/similar-check (#369): read-only. Flags generated candidates whose question is similar
/// (pg_trgm similarity &gt;= 0.6 after trim + lower-casing) to an item visible to the caller in the document's category, or to an
/// earlier candidate in the same request. Candidates whose normalized correct answers differ are marked as a conflict that
/// shows both answers; nothing is resolved automatically.
/// </summary>
public static partial class CheckStudyGuideSimilarity
{
    public const int MaxCandidatesPerRequest = 200;
    public const double Threshold = 0.6;

    public sealed record Request(List<Guid>? CandidateIds);

    public sealed record SimilarTo(string Kind, string? ItemId, string? CandidateId, string Question, string CorrectAnswer, double Similarity);

    /// <summary>Origin: "this" (the flagged candidate) or "other" (the similar item or candidate). Page is null when unknown.</summary>
    public sealed record ConflictAnswer(string Answer, string Source, int? Page, string Origin);

    public sealed record Conflict(List<ConflictAnswer> Answers);

    public sealed record Flag(string CandidateId, SimilarTo SimilarTo, Conflict? Conflict);

    public sealed record Response(List<Flag> Flags);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.CandidateIds)
                .NotNull().WithMessage("Select at least one question.")
                .Must(ids => ids is not null && ids.Count is > 0 and <= MaxCandidatesPerRequest)
                .WithMessage($"Select between 1 and {MaxCandidatesPerRequest} questions.");
            RuleForEach(x => x.CandidateIds).NotEmpty().WithMessage("Candidate id is required.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guides/documents/{id:guid}/similar-check", Handler)
                .WithTags("StudyGuideDocuments")
                .WithSummary("Flag generated questions that are similar to an existing item in the same category or to another selected question")
                .WithDescription("Owner only; other users get 404. Read-only.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return CustomResults.Unauthorized();
            }

            FluentValidation.Results.ValidationResult validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return Results.BadRequest(validation.Errors);
            }

            Response? response = await HandleAsync(id, request.CandidateIds!, db, userContext.UserId, cancellationToken);
            return response is null ? Results.NotFound() : Results.Ok(response);
        }
    }

    private sealed record ItemMatchRow(long Idx, Guid ItemId, string Question, string CorrectAnswer, string Explanation, float Similarity);

    private sealed record PairRow(long IdxA, long IdxB, float Similarity);

    internal static async Task<Response?> HandleAsync(
        Guid id,
        IReadOnlyCollection<Guid> candidateIds,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        StudyGuideDocument? document = await db.StudyGuideDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, cancellationToken);
        if (document is null)
        {
            return null;
        }

        List<Guid> ids = candidateIds.Distinct().ToList();
        var sections = (await db.StudyGuideSections
                .AsNoTracking()
                .Where(section => section.DocumentId == document.Id && section.GenerationId != null)
                .Select(section => new { GenerationId = section.GenerationId!.Value, section.Index })
                .ToListAsync(cancellationToken))
            .GroupBy(section => section.GenerationId)
            .ToDictionary(group => group.Key, group => group.Min(section => section.Index));
        List<Guid> generationIds = sections.Keys.ToList();

        List<GenerationCandidate> loaded = await db.GenerationCandidates
            .AsNoTracking()
            .Where(candidate => ids.Contains(candidate.Id) && generationIds.Contains(candidate.GenerationId))
            .ToListAsync(cancellationToken);
        if (loaded.Count != ids.Count)
        {
            return new Response([]);
        }

        HashSet<Guid> alreadyAccepted = (await db.StudyGuideAcceptedCandidates
                .AsNoTracking()
                .Where(accepted => accepted.DocumentId == document.Id && ids.Contains(accepted.CandidateId))
                .Select(accepted => accepted.CandidateId)
                .ToListAsync(cancellationToken))
            .ToHashSet();
        List<GenerationCandidate> candidates = loaded
            .Where(candidate => !alreadyAccepted.Contains(candidate.Id))
            .OrderBy(candidate => sections[candidate.GenerationId])
            .ThenBy(candidate => candidate.Index)
            .ToList();
        if (candidates.Count == 0)
        {
            return new Response([]);
        }

        string[] texts = candidates.Select(candidate => ItemSimHashInput.Normalize(candidate.Question)).ToArray();

        // The caller's own items plus public, media-eligible ones (ItemVisibility), in the document's category only.
        string itemSql = $"""
            SELECT q.idx AS "Idx", i."Id" AS "ItemId", i."Question", i."CorrectAnswer", i."Explanation",
                similarity(lower(btrim(i."Question")), q.txt) AS "Similarity"
            FROM unnest(@Texts) WITH ORDINALITY AS q(txt, idx)
            CROSS JOIN "Items" i
            JOIN "Categories" c ON c."Id" = i."CategoryId"
            WHERE c."Name" = @Category
                AND ((i."IsPrivate" = false AND {ItemVisibility.MediaEligibleSql("i")}) OR i."CreatedBy" = @UserId)
                AND similarity(lower(btrim(i."Question")), q.txt) >= @Threshold
            ORDER BY q.idx, "Similarity" DESC, i."Id"
            """;
        List<ItemMatchRow> itemMatches = await db.Database
            .SqlQueryRaw<ItemMatchRow>(
                itemSql,
                new NpgsqlParameter("Texts", texts),
                new NpgsqlParameter("Category", document.CategoryName),
                new NpgsqlParameter("UserId", userId),
                new NpgsqlParameter("Threshold", (float)Threshold))
            .ToListAsync(cancellationToken);

        const string pairSql = """
            SELECT a.idx AS "IdxA", b.idx AS "IdxB", similarity(a.txt, b.txt) AS "Similarity"
            FROM unnest(@Texts) WITH ORDINALITY AS a(txt, idx)
            JOIN unnest(@Texts) WITH ORDINALITY AS b(txt, idx) ON a.idx < b.idx AND similarity(a.txt, b.txt) >= @Threshold
            ORDER BY b.idx, "Similarity" DESC, a.idx
            """;
        List<PairRow> pairs = await db.Database
            .SqlQueryRaw<PairRow>(
                pairSql,
                new NpgsqlParameter("Texts", texts),
                new NpgsqlParameter("Threshold", (float)Threshold))
            .ToListAsync(cancellationToken);

        Dictionary<long, ItemMatchRow> bestItem = itemMatches
            .GroupBy(match => match.Idx)
            .ToDictionary(group => group.Key, group => group.First());
        Dictionary<long, PairRow> bestPair = pairs
            .GroupBy(pair => pair.IdxB)
            .ToDictionary(group => group.Key, group => group.First());

        List<Flag> flags = [];
        for (int index = 0; index < candidates.Count; index++)
        {
            long position = index + 1;
            GenerationCandidate candidate = candidates[index];
            if (bestItem.TryGetValue(position, out ItemMatchRow? item))
            {
                Conflict? conflict = Differs(candidate.CorrectAnswer, item.CorrectAnswer)
                    ? new Conflict(
                    [
                        new ConflictAnswer(candidate.CorrectAnswer, document.Title, candidate.Page, "this"),
                        new ConflictAnswer(item.CorrectAnswer, ItemSourceTitle(item.Explanation), null, "other")
                    ])
                    : null;
                flags.Add(new Flag(
                    candidate.Id.ToString(),
                    new SimilarTo("item", item.ItemId.ToString(), null, item.Question, item.CorrectAnswer, item.Similarity),
                    conflict));
            }
            else if (bestPair.TryGetValue(position, out PairRow? pair))
            {
                GenerationCandidate other = candidates[(int)pair.IdxA - 1];
                Conflict? conflict = Differs(candidate.CorrectAnswer, other.CorrectAnswer)
                    ? new Conflict(
                    [
                        new ConflictAnswer(candidate.CorrectAnswer, document.Title, candidate.Page, "this"),
                        new ConflictAnswer(other.CorrectAnswer, document.Title, other.Page, "other")
                    ])
                    : null;
                flags.Add(new Flag(
                    candidate.Id.ToString(),
                    new SimilarTo("candidate", null, other.Id.ToString(), other.Question, other.CorrectAnswer, pair.Similarity),
                    conflict));
            }
        }

        return new Response(flags);
    }

    private static bool Differs(string a, string b) =>
        !string.Equals(a.Trim(), b.Trim(), StringComparison.OrdinalIgnoreCase);

    /// <summary>The saved item has no page; its source is the "From &lt;title&gt;" suffix of a study-guide explanation, else empty.</summary>
    private static string ItemSourceTitle(string explanation)
    {
        Match match = FromSuffix().Match(explanation);
        return match.Success ? match.Groups[1].Value : string.Empty;
    }

    [GeneratedRegex("\\n\\nFrom \"(.+)\", [^\\n]*$", RegexOptions.Singleline)]
    private static partial Regex FromSuffix();
}
