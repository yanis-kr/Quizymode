using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items.Get;

public static class GetItems
{
    public sealed record QueryRequest(
        string? Category,
        string? Subcategory,
        bool? IsPrivate,
        List<string>? Keywords,
        int Page = 1,
        int PageSize = 10);

    public sealed record Response(
        List<ItemResponse> Items,
        int TotalCount,
        int Page,
        int PageSize,
        int TotalPages);

    public sealed record ItemResponse(
        string Id,
        string Category,
        string Subcategory,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt,
        List<KeywordResponse> Keywords);

    public sealed record KeywordResponse(
        string Id,
        string Name,
        bool IsPrivate);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("items", Handler)
                .WithTags("Items")
                .WithSummary("Get quiz items with filtering and pagination")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string? category,
            string? subcategory,
            bool? isPrivate,
            string? keywords,
            int page = 1,
            int pageSize = 10,
            ApplicationDbContext db = null!,
            IUserContext userContext = null!,
            CancellationToken cancellationToken = default)
        {
            if (page < 1)
            {
                return CustomResults.BadRequest("Page must be greater than 0");
            }

            if (pageSize < 1 || pageSize > 100)
            {
                return CustomResults.BadRequest("PageSize must be between 1 and 100");
            }

            List<string>? keywordList = null;
            if (!string.IsNullOrEmpty(keywords))
            {
                keywordList = keywords.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(k => !string.IsNullOrWhiteSpace(k))
                    .ToList();
            }

            var request = new QueryRequest(category, subcategory, isPrivate, keywordList, page, pageSize);
            Result<Response> result = await GetItemsHandler.HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature
        }
    }
}

