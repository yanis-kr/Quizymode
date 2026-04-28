using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class GetFeaturedAdmin
{
    public sealed record FeaturedItemDto(
        Guid Id,
        string Type,
        string DisplayName,
        string? CategorySlug,
        string? NavKeyword1,
        string? NavKeyword2,
        Guid? CollectionId,
        string? CollectionName,
        int SortOrder,
        DateTime CreatedAt);

    public sealed record Response(List<FeaturedItemDto> Items);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/featured", Handler)
                .WithTags("Admin")
                .WithSummary("List all featured items (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static async Task<IResult> Handler(
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(db, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            List<FeaturedItem> items = await db.FeaturedItems
                .AsNoTracking()
                .Include(f => f.Collection)
                .OrderBy(f => f.SortOrder)
                .ThenBy(f => f.DisplayName)
                .ToListAsync(cancellationToken);

            List<FeaturedItemDto> dtos = items.Select(f => new FeaturedItemDto(
                f.Id,
                f.Type.ToString(),
                f.DisplayName,
                f.CategorySlug,
                f.NavKeyword1,
                f.NavKeyword2,
                f.CollectionId,
                f.Collection?.Name,
                f.SortOrder,
                f.CreatedAt)).ToList();

            return Result.Success(new Response(dtos));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Featured.GetAdminFailed", $"Failed to retrieve featured items: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
        }
    }
}
