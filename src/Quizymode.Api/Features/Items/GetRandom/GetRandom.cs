using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items.GetRandom;

public static class GetRandom
{
    public sealed record QueryRequest(
        string? Category,
        string? Subcategory,
        int Count = 10);

    public sealed record Response(
        List<ItemResponse> Items);

    public sealed record ItemResponse(
        string Id,
        string Category,
        string Subcategory,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("items/random", Handler)
                .WithTags("Items")
                .WithSummary("Get random quiz items")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            string? category,
            string? subcategory,
            int count = 10,
            ApplicationDbContext db = null!,
            IUserContext userContext = null!,
            CancellationToken cancellationToken = default)
        {
            if (count < 1 || count > 100)
            {
                return CustomResults.BadRequest("Count must be between 1 and 100");
            }

            var request = new QueryRequest(category, subcategory, count);
            Result<Response> result = await GetRandomHandler.HandleAsync(request, db, userContext, cancellationToken);

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

