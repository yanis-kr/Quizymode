using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class DeleteFeaturedItem
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapDelete("admin/featured/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Remove a featured item (Admin only)")
                .RequireAuthorization("Admin")
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result result = await HandleAsync(id, db, cancellationToken);
            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        Guid id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            FeaturedItem? item = await db.FeaturedItems
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (item is null)
                return Result.Failure(Error.NotFound("FeaturedItem.NotFound", $"Featured item {id} not found"));

            db.FeaturedItems.Remove(item);
            await db.SaveChangesAsync(cancellationToken);
            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Featured.DeleteFailed", $"Failed to delete featured item: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
        }
    }
}
