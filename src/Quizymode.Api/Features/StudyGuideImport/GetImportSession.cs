using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideImport;

public static class GetImportSession
{
    public sealed record ChunkDto(string Id, int ChunkIndex, string Title, int SizeBytes, string PromptText);
    public sealed record PromptResultDto(int ChunkIndex, string ValidationStatus, string? ParsedItemsJson, string? ValidationMessagesJson);
    public sealed record DedupResultDto(string? DedupPromptText, string? RawDedupResponseText, string? ValidationStatus, string? ParsedDedupItemsJson);

    public sealed record Response(
        string Id,
        string StudyGuideId,
        string CategoryName,
        List<string> NavigationKeywordPath,
        List<string>? DefaultKeywords,
        int TargetItemsPerChunk,
        string Status,
        List<ChunkDto> Chunks,
        List<PromptResultDto> PromptResults,
        DedupResultDto? DedupResult);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("study-guides/import/sessions/{id}", Handler)
                .WithTags("StudyGuideImport")
                .WithSummary("Get import session with chunks and results")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            Result<Response?> result = await HandleAsync(id, db, userContext.UserId, cancellationToken);
            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        string id,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out Guid sessionId))
            return Result.Success<Response?>(null);

        StudyGuideImportSession? session = await db.StudyGuideImportSessions
            .Include(s => s.StudyGuide)
            .Where(s => s.Id == sessionId && s.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);

        if (session is null)
            return Result.Success<Response?>(null);

        List<StudyGuideChunk> chunks = await db.StudyGuideChunks
            .Where(c => c.ImportSessionId == sessionId)
            .OrderBy(c => c.ChunkIndex)
            .ToListAsync(cancellationToken);

        List<StudyGuidePromptResult> results = await db.StudyGuidePromptResults
            .Where(r => r.ImportSessionId == sessionId)
            .OrderBy(r => r.ChunkIndex)
            .ToListAsync(cancellationToken);

        StudyGuideDedupResult? dedup = await db.StudyGuideDedupResults
            .Where(d => d.ImportSessionId == sessionId)
            .FirstOrDefaultAsync(cancellationToken);

        var navPath = JsonSerializer.Deserialize<List<string>>(session.NavigationKeywordPathJson) ?? new List<string>();
        var defaultKw = string.IsNullOrEmpty(session.DefaultKeywordsJson)
            ? null
            : JsonSerializer.Deserialize<List<string>>(session.DefaultKeywordsJson);

        var chunkDtos = chunks.Select(c => new ChunkDto(
            c.Id.ToString(),
            c.ChunkIndex,
            c.Title,
            c.SizeBytes,
            c.PromptText)).ToList();

        var resultDtos = results.Select(r => new PromptResultDto(
            r.ChunkIndex,
            r.ValidationStatus.ToString(),
            r.ParsedItemsJson,
            r.ValidationMessagesJson)).ToList();

        DedupResultDto? dedupDto = null;
        if (dedup != null)
        {
            string? dedupPromptText = null;
            if (chunks.Count > 1)
            {
                var allQuestions = new List<string>();
                foreach (var r in results.Where(x => !string.IsNullOrEmpty(x.ParsedItemsJson)))
                {
                    try
                    {
                        var items = JsonSerializer.Deserialize<List<JsonElement>>(r.ParsedItemsJson!);
                        if (items != null)
                            foreach (var item in items)
                                if (item.TryGetProperty("question", out var q))
                                    allQuestions.Add(q.GetString() ?? "");
                    }
                    catch { /* ignore */ }
                }
                var promptBuilder = new StudyGuidePromptBuilderService();
                dedupPromptText = promptBuilder.BuildDedupPrompt(allQuestions, session.StudyGuide?.Title ?? "Study guide");
            }
            dedupDto = new DedupResultDto(
                dedupPromptText,
                dedup.RawDedupResponseText,
                dedup.ValidationStatus.ToString(),
                dedup.ParsedDedupItemsJson);
        }
        else if (chunks.Count > 1)
        {
            var allQuestions = new List<string>();
            foreach (var r in results.Where(x => !string.IsNullOrEmpty(x.ParsedItemsJson)))
            {
                try
                {
                    var items = JsonSerializer.Deserialize<List<JsonElement>>(r.ParsedItemsJson!);
                    if (items != null)
                        foreach (var item in items)
                            if (item.TryGetProperty("question", out var q))
                                allQuestions.Add(q.GetString() ?? "");
                }
                catch { /* ignore */ }
            }
            if (allQuestions.Count > 0)
            {
                var promptBuilder = new StudyGuidePromptBuilderService();
                string promptText = promptBuilder.BuildDedupPrompt(allQuestions, session.StudyGuide?.Title ?? "Study guide");
                dedupDto = new DedupResultDto(promptText, null, null, null);
            }
        }

        var response = new Response(
            session.Id.ToString(),
            session.StudyGuideId.ToString(),
            session.CategoryName,
            navPath,
            defaultKw,
            session.TargetItemsPerChunk,
            session.Status.ToString(),
            chunkDtos,
            resultDtos,
            dedupDto);

        return Result.Success<Response?>(response);
    }
}
