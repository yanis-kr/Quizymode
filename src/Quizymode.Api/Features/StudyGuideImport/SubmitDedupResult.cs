using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideImport;

public static class SubmitDedupResult
{
    public sealed record Request(string RawDedupResponseText);

    public sealed record Response(
        string ValidationStatus,
        List<string> ValidationMessages,
        string? ParsedDedupItemsJson);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guides/import/sessions/{id}/dedup-result", Handler)
                .WithTags("StudyGuideImport")
                .WithSummary("Submit deduplicated AI response")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            Request request,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            Result<Response?> result = await HandleAsync(id, request.RawDedupResponseText, db, userContext.UserId, cancellationToken);
            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        string id,
        string rawDedupResponseText,
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

        List<JsonElement>? array;
        try
        {
            using var doc = JsonDocument.Parse(rawDedupResponseText);
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

        (bool isValid, List<string> messages, var _) = StudyGuideItemValidator.ValidateAndMap(
            array,
            session.CategoryName,
            sessionKeywords);

        var status = isValid ? StudyGuidePromptResultStatus.Valid : StudyGuidePromptResultStatus.Invalid;
        string? parsedJson = isValid ? rawDedupResponseText : null;

        var existing = await db.StudyGuideDedupResults
            .FirstOrDefaultAsync(d => d.ImportSessionId == sessionId, cancellationToken);

        var now = DateTime.UtcNow;
        if (existing != null)
        {
            existing.RawDedupResponseText = rawDedupResponseText;
            existing.ParsedDedupItemsJson = parsedJson;
            existing.ValidationStatus = status;
        }
        else
        {
            db.StudyGuideDedupResults.Add(new StudyGuideDedupResult
            {
                Id = Guid.NewGuid(),
                ImportSessionId = sessionId,
                RawDedupResponseText = rawDedupResponseText,
                ParsedDedupItemsJson = parsedJson,
                ValidationStatus = status,
                CreatedUtc = now
            });
        }

        session.UpdatedUtc = now;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success<Response?>(new Response(
            status.ToString(),
            messages,
            parsedJson));
    }
}
