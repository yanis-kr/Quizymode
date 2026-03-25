using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideImport;

public static class FinalizeImport
{
    public sealed record Response(
        int CreatedCount,
        int DuplicateCount,
        int FailedCount,
        List<string> CreatedItemIds,
        List<string> Errors);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guides/import/sessions/{id}/finalize", Handler)
                .WithTags("StudyGuideImport")
                .WithSummary("Finalize import: create items from prompt or dedup results")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            ApplicationDbContext db,
            IUserContext userContext,
            ISimHashService simHashService,
            ITaxonomyItemCategoryResolver itemCategoryResolver,
            ITaxonomyRegistry taxonomyRegistry,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                return Results.Unauthorized();

            Result<Response?> result = await HandleAsync(
                id,
                db,
                userContext,
                simHashService,
                itemCategoryResolver,
                taxonomyRegistry,
                auditService,
                cancellationToken);
            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        string id,
        ApplicationDbContext db,
        IUserContext userContext,
        ISimHashService simHashService,
        ITaxonomyItemCategoryResolver itemCategoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(id, out Guid sessionId))
            return Result.Success<Response?>(null);

        StudyGuideImportSession? session = await db.StudyGuideImportSessions
            .Where(s => s.Id == sessionId && s.UserId == userContext.UserId)
            .FirstOrDefaultAsync(cancellationToken);

        if (session is null)
            return Result.Success<Response?>(null);

        List<string> navPath = JsonSerializer.Deserialize<List<string>>(session.NavigationKeywordPathJson) ?? [];
        List<string> defaultKeywords = string.IsNullOrEmpty(session.DefaultKeywordsJson)
            ? []
            : JsonSerializer.Deserialize<List<string>>(session.DefaultKeywordsJson) ?? [];
        if (navPath.Count < 2)
        {
            return Result.Failure<Response?>(
                Error.Validation(
                    "Import.InvalidNavigation",
                    "Study guide navigation must include a primary topic and subtopic (at least two keywords)."));
        }

        List<AddItemsBulk.KeywordRequest> sessionKeywords = defaultKeywords
            .Select(k => new AddItemsBulk.KeywordRequest(k, true))
            .ToList();

        List<AddItemsBulk.ItemRequest>? itemsToImport = null;

        StudyGuideDedupResult? dedup = await db.StudyGuideDedupResults
            .FirstOrDefaultAsync(d => d.ImportSessionId == sessionId, cancellationToken);

        if (dedup != null && !string.IsNullOrEmpty(dedup.ParsedDedupItemsJson) && dedup.ValidationStatus == StudyGuidePromptResultStatus.Valid)
        {
            using var doc = JsonDocument.Parse(dedup.ParsedDedupItemsJson);
            var array = new List<JsonElement>();
            foreach (var e in doc.RootElement.EnumerateArray())
                array.Add(e.Clone());
            (_, _, itemsToImport) = StudyGuideItemValidator.ValidateAndMap(array, session.CategoryName, sessionKeywords);
        }
        else
        {
            var results = await db.StudyGuidePromptResults
                .Where(r => r.ImportSessionId == sessionId && r.ValidationStatus == StudyGuidePromptResultStatus.Valid && r.ParsedItemsJson != null)
                .OrderBy(r => r.ChunkIndex)
                .ToListAsync(cancellationToken);

            if (results.Count == 0)
                return Result.Failure<Response?>(Error.Validation("Import.NoValidResults", "No validated prompt results. Submit and validate at least one chunk response."));

            var allItems = new List<AddItemsBulk.ItemRequest>();
            foreach (var r in results)
            {
                using var doc = JsonDocument.Parse(r.ParsedItemsJson!);
                var array = new List<JsonElement>();
                foreach (var e in doc.RootElement.EnumerateArray())
                    array.Add(e.Clone());
                (_, _, var items) = StudyGuideItemValidator.ValidateAndMap(array, session.CategoryName, sessionKeywords);
                if (items != null)
                    allItems.AddRange(items);
            }
            itemsToImport = allItems;
        }

        if (itemsToImport == null || itemsToImport.Count == 0)
            return Result.Failure<Response?>(Error.Validation("Import.NoItems", "No items to import."));

        Guid uploadId = Guid.NewGuid();
        string keyword1 = navPath[0];
        string keyword2 = navPath[1];
        AddItemsBulk.Request bulkRequest = new AddItemsBulk.Request(
            IsPrivate: true,
            Category: session.CategoryName,
            Keyword1: keyword1,
            Keyword2: keyword2,
            Keywords: sessionKeywords,
            Items: itemsToImport,
            UploadId: uploadId);
        Result<AddItemsBulk.Response> bulkResult = await AddItemsBulkHandler.HandleAsync(
            bulkRequest,
            db,
            simHashService,
            userContext,
            itemCategoryResolver,
            taxonomyRegistry,
            auditService,
            cancellationToken);

        if (bulkResult.IsFailure)
            return Result.Failure<Response?>(bulkResult.Error!);

        var bulk = bulkResult.Value!;
        session.Status = StudyGuideImportSessionStatus.Completed;
        session.UpdatedUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success<Response?>(new Response(
            bulk.CreatedCount,
            bulk.DuplicateCount,
            bulk.FailedCount,
            (bulk.CreatedItemIds ?? new List<Guid>()).Select(g => g.ToString()).ToList(),
            bulk.Errors?.Select(e => e.ErrorMessage).ToList() ?? new List<string>()));
    }
}
