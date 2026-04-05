using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideImport;

public static class SubmitChunkResult
{
    public sealed record Request(string RawResponseText);

    public sealed record Response(
        string ValidationStatus,
        List<string> ValidationMessages,
        string? ParsedItemsJson);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guides/import/sessions/{id}/chunks/{chunkIndex}/result", Handler)
                .WithTags("StudyGuideImport")
                .WithSummary("Submit AI response for a chunk")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            int chunkIndex,
            Request request,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            Result<Response?> result = await HandleAsync(id, chunkIndex, request.RawResponseText, db, userContext.UserId, cancellationToken);
            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        string id,
        int chunkIndex,
        string rawResponseText,
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

        StudyGuideChunk? chunk = await db.StudyGuideChunks
            .FirstOrDefaultAsync(c => c.ImportSessionId == sessionId && c.ChunkIndex == chunkIndex, cancellationToken);

        if (chunk is null)
            return Result.Success<Response?>(null);

        List<JsonElement>? array;
        try
        {
            using var doc = JsonDocument.Parse(rawResponseText);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return Result.Success<Response?>(new Response(
                    "Invalid",
                    new List<string> { "Root must be a JSON array." },
                    null));
            }
            array = new List<JsonElement>();
            foreach (var e in doc.RootElement.EnumerateArray())
                array.Add(e.Clone());
        }
        catch (JsonException ex)
        {
            return Result.Success<Response?>(new Response(
                "Invalid",
                new List<string> { "Invalid JSON: " + ex.Message },
                null));
        }

        var defaultKeywords = string.IsNullOrEmpty(session.DefaultKeywordsJson)
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(session.DefaultKeywordsJson) ?? new List<string>();
        var sessionKeywords = defaultKeywords
            .Select(k => new Quizymode.Api.Features.Items.AddBulk.AddItemsBulk.KeywordRequest(k, true))
            .ToList();

        List<string> navPath = JsonSerializer.Deserialize<List<string>>(session.NavigationKeywordPathJson) ?? [];

        (bool isValid, List<string> messages, _, string? enrichedJson) = StudyGuideItemValidator.ValidateAndMap(
            array,
            session.CategoryName,
            navPath,
            sessionKeywords);

        var status = isValid ? StudyGuidePromptResultStatus.Valid : StudyGuidePromptResultStatus.Invalid;
        // Store enriched JSON (with overridden category/navigation) instead of raw AI text
        string? parsedJson = isValid ? enrichedJson : null;

        var existing = await db.StudyGuidePromptResults
            .FirstOrDefaultAsync(r => r.ImportSessionId == sessionId && r.ChunkIndex == chunkIndex, cancellationToken);

        var now = DateTime.UtcNow;
        if (existing != null)
        {
            existing.RawResponseText = rawResponseText;
            existing.ParsedItemsJson = parsedJson;
            existing.ValidationStatus = status;
            existing.ValidationMessagesJson = JsonSerializer.Serialize(messages);
            existing.UpdatedUtc = now;
        }
        else
        {
            db.StudyGuidePromptResults.Add(new StudyGuidePromptResult
            {
                Id = Guid.NewGuid(),
                ImportSessionId = sessionId,
                ChunkIndex = chunkIndex,
                RawResponseText = rawResponseText,
                ParsedItemsJson = parsedJson,
                ValidationStatus = status,
                ValidationMessagesJson = JsonSerializer.Serialize(messages),
                CreatedUtc = now,
                UpdatedUtc = now
            });
        }

        session.Status = StudyGuideImportSessionStatus.InProgress;
        session.UpdatedUtc = now;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success<Response?>(new Response(
            status.ToString(),
            messages,
            parsedJson));
    }
}
