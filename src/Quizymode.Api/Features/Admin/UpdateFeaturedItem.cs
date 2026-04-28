using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class UpdateFeaturedItem
{
    public sealed record Request(string? DisplayName, int? SortOrder);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.DisplayName)
                .MaximumLength(200)
                .When(x => x.DisplayName is not null);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPatch("admin/featured/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Update a featured item's display name or sort order (Admin only)")
                .RequireAuthorization("Admin")
                .Produces(StatusCodes.Status204NoContent)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
                return Results.BadRequest(validationResult.Errors);

            Result result = await HandleAsync(id, request, db, cancellationToken);
            return result.Match(
                () => Results.NoContent(),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result> HandleAsync(
        Guid id,
        Request request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            FeaturedItem? item = await db.FeaturedItems
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (item is null)
                return Result.Failure(Error.NotFound("FeaturedItem.NotFound", $"Featured item {id} not found"));

            if (request.DisplayName is not null)
                item.DisplayName = request.DisplayName.Trim();

            if (request.SortOrder.HasValue)
                item.SortOrder = request.SortOrder.Value;

            await db.SaveChangesAsync(cancellationToken);
            return Result.Success();
        }
        catch (Exception ex)
        {
            return Result.Failure(
                Error.Problem("Featured.UpdateFailed", $"Failed to update featured item: {ex.Message}"));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}
