using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Keywords;

/// <summary>
/// Returns navigation keyword descriptions for a path (category + keyword names).
/// Used to show descriptions in breadcrumbs when displaying navigation URLs.
/// </summary>
public static class GetKeywordDescriptions
{
    public sealed record KeywordDescriptionResponse(string Name, string? Description);

    public sealed record Response(List<KeywordDescriptionResponse> Keywords);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("keywords/descriptions", Handler)
                .WithTags("Keywords")
                .WithSummary("Get descriptions for navigation path keywords")
                .WithDescription("Returns the description for each keyword in the path (for breadcrumb tooltips). Category is the category name. Keywords is comma-separated list of keyword names in path order.")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string category,
            string? keywords,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(category))
            {
                return Results.BadRequest("Category is required");
            }

            List<string> keywordNames = string.IsNullOrWhiteSpace(keywords)
                ? new List<string>()
                : keywords.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(k => !string.IsNullOrWhiteSpace(k))
                    .ToList();

            Result<Response> result = await HandleAsync(category.Trim(), keywordNames, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        string categoryName,
        List<string> keywordNames,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Guid? categoryId = await ResolveCategoryIdAsync(categoryName, db, userContext, cancellationToken);
        if (!categoryId.HasValue)
        {
            return Result.Failure<Response>(
                Error.NotFound("Keywords.CategoryNotFound", $"Category '{categoryName}' not found"));
        }

        if (keywordNames.Count == 0)
        {
            return Result.Success(new Response(new List<KeywordDescriptionResponse>()));
        }

        List<string> normalized = keywordNames.Select(k => k.Trim().ToLower()).ToList();

        // Only rank-1 and rank-2 navigation keywords have descriptions for the breadcrumb
        var dbResults = await db.CategoryKeywords
            .Where(ck => ck.CategoryId == categoryId.Value)
            .Where(ck => ck.NavigationRank == 1 || ck.NavigationRank == 2)
            .Where(ck => normalized.Contains(ck.Keyword.Name.ToLower()))
            .Select(ck => new { ck.Keyword.Name, ck.Description })
            .ToListAsync(cancellationToken);

        // Preserve order of keywordNames; include description null for any not found
        List<KeywordDescriptionResponse> ordered = keywordNames
            .Select(name =>
            {
                var match = dbResults.FirstOrDefault(r => r.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                return new KeywordDescriptionResponse(name, match?.Description);
            })
            .ToList();

        return Result.Success(new Response(ordered));
    }

    private static async Task<Guid?> ResolveCategoryIdAsync(
        string categoryName,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Category? globalCategory = await db.Categories
            .FirstOrDefaultAsync(c => !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);
        if (globalCategory is not null)
            return globalCategory.Id;

        if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
        {
            Category? privateCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.IsPrivate
                    && c.CreatedBy == userContext.UserId
                    && c.Name.ToLower() == categoryName.ToLower(), cancellationToken);
            if (privateCategory is not null)
                return privateCategory.Id;
        }

        return null;
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed
        }
    }
}
