using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideImport;

public static class GenerateChunks
{
    public sealed record ChunkInfo(string Id, int ChunkIndex, string Title, int SizeBytes);
    public sealed record Response(List<ChunkInfo> Chunks);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guides/import/sessions/{id}/generate-chunks", Handler)
                .WithTags("StudyGuideImport")
                .WithSummary("Generate chunks and prompts for the session")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            IUserContext userContext,
            IStudyGuideChunkingService chunkingService,
            IStudyGuidePromptBuilderService promptBuilder,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            Result<Response?> result = await HandleAsync(id, db, userContext.UserId, chunkingService, promptBuilder, cancellationToken);
            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        string id,
        ApplicationDbContext db,
        string userId,
        IStudyGuideChunkingService chunkingService,
        IStudyGuidePromptBuilderService promptBuilder,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out Guid sessionId))
            return Result.Success<Response?>(null);

        StudyGuideImportSession? session = await db.StudyGuideImportSessions
            .Include(s => s.StudyGuide)
            .Where(s => s.Id == sessionId && s.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);

        if (session is null || session.StudyGuide is null)
            return Result.Success<Response?>(null);

        var navPath = JsonSerializer.Deserialize<List<string>>(session.NavigationKeywordPathJson) ?? new List<string>();
        var defaultKw = string.IsNullOrEmpty(session.DefaultKeywordsJson)
            ? null
            : JsonSerializer.Deserialize<List<string>>(session.DefaultKeywordsJson);
        int targetSetCount = Math.Clamp(session.TargetItemsPerChunk, 1, 6);

        IReadOnlyList<ChunkResult> chunkResults = chunkingService.Chunk(
            session.StudyGuide.ContentText,
            session.StudyGuide.Title,
            targetSetCount);

        await db.StudyGuideChunks.Where(c => c.ImportSessionId == sessionId).ExecuteDeleteAsync(cancellationToken);
        await db.StudyGuidePromptResults.Where(r => r.ImportSessionId == sessionId).ExecuteDeleteAsync(cancellationToken);
        await db.StudyGuideDedupResults.Where(d => d.ImportSessionId == sessionId).ExecuteDeleteAsync(cancellationToken);

        var chunkInfos = new List<ChunkInfo>();
        var previousQuestionTexts = new List<string>();

        for (int i = 0; i < chunkResults.Count; i++)
        {
            ChunkResult cr = chunkResults[i];
            string promptText = promptBuilder.BuildChunkPrompt(
                i,
                chunkResults.Count,
                cr.Title,
                cr.ChunkText,
                session.CategoryName,
                navPath,
                defaultKw,
                previousQuestionTexts.Count > 0 ? previousQuestionTexts : null);

            var chunk = new StudyGuideChunk
            {
                Id = Guid.NewGuid(),
                ImportSessionId = sessionId,
                ChunkIndex = i,
                Title = cr.Title,
                ChunkText = cr.ChunkText,
                SizeBytes = cr.SizeBytes,
                PromptText = promptText,
                CreatedUtc = DateTime.UtcNow
            };
            db.StudyGuideChunks.Add(chunk);
            chunkInfos.Add(new ChunkInfo(chunk.Id.ToString(), chunk.ChunkIndex, chunk.Title, chunk.SizeBytes));
        }

        session.Status = StudyGuideImportSessionStatus.ChunksGenerated;
        session.UpdatedUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success<Response?>(new Response(chunkInfos));
    }
}
