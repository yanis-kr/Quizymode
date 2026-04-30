using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Services;

namespace Quizymode.Api.Features.Admin;

public static class AddFeaturedItem
{
    public sealed record Request(
        string Type,
        string DisplayName,
        string? CategorySlug,
        string? NavKeyword1,
        string? NavKeyword2,
        Guid? CollectionId,
        int? SortOrder = null);

    public sealed record Response(Guid Id);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Type)
                .NotEmpty()
                .Must(t => t == "Set" || t == "Collection")
                .WithMessage("Type must be 'Set' or 'Collection'");

            RuleFor(x => x.DisplayName)
                .NotEmpty()
                .MaximumLength(200);

            When(x => x.Type == "Set", () =>
            {
                RuleFor(x => x.CategorySlug)
                    .NotEmpty()
                    .WithMessage("CategorySlug is required for sets")
                    .MaximumLength(50);

                RuleFor(x => x.NavKeyword1)
                    .NotEmpty()
                    .WithMessage("NavKeyword1 is required for sets")
                    .MaximumLength(100);

                RuleFor(x => x.NavKeyword2)
                    .MaximumLength(100);
            });

            When(x => x.Type == "Collection", () =>
            {
                RuleFor(x => x.CollectionId)
                    .NotNull()
                    .WithMessage("CollectionId is required for collections");
            });
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/featured", Handler)
                .WithTags("Admin")
                .WithSummary("Add a featured set or collection (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
                return Results.BadRequest(validationResult.Errors);

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);
            return result.Match(
                value => Results.Created($"/admin/featured/{value.Id}", value),
                _ => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            FeaturedItemType type = request.Type == "Collection" ? FeaturedItemType.Collection : FeaturedItemType.Set;

            if (type == FeaturedItemType.Set)
            {
                string? catSlug = request.CategorySlug?.Trim().ToLower();
                string? kw1 = request.NavKeyword1?.Trim().ToLower();
                string? kw2 = string.IsNullOrWhiteSpace(request.NavKeyword2) ? null : request.NavKeyword2.Trim().ToLower();

                bool isDuplicate = await db.FeaturedItems
                    .AnyAsync(f => f.Type == FeaturedItemType.Set
                        && f.CategorySlug == catSlug
                        && f.NavKeyword1 == kw1
                        && f.NavKeyword2 == kw2, cancellationToken);

                if (isDuplicate)
                    return Result.Failure<Response>(Error.Conflict("Featured.DuplicateSet", "This set is already featured."));
            }
            else if (type == FeaturedItemType.Collection)
            {
                if (!request.CollectionId.HasValue)
                    return Result.Failure<Response>(Error.Failure("Featured.MissingCollection", "CollectionId is required."));

                bool collectionExists = await db.Collections
                    .AnyAsync(c => c.Id == request.CollectionId.Value, cancellationToken);

                if (!collectionExists)
                    return Result.Failure<Response>(Error.NotFound("Collection.NotFound", $"Collection {request.CollectionId} not found"));

                bool isDuplicate = await db.FeaturedItems
                    .AnyAsync(f => f.Type == FeaturedItemType.Collection
                        && f.CollectionId == request.CollectionId.Value, cancellationToken);

                if (isDuplicate)
                    return Result.Failure<Response>(Error.Conflict("Featured.DuplicateCollection", "This collection is already featured."));
            }

            int sortOrder = request.SortOrder ?? (await db.FeaturedItems
                .Where(f => f.Type == type)
                .MaxAsync(f => (int?)f.SortOrder, cancellationToken) ?? -1) + 1;

            FeaturedItem item = new()
            {
                Id = Guid.NewGuid(),
                Type = type,
                DisplayName = request.DisplayName.Trim(),
                CategorySlug = request.CategorySlug?.Trim().ToLower(),
                NavKeyword1 = request.NavKeyword1?.Trim().ToLower(),
                NavKeyword2 = string.IsNullOrWhiteSpace(request.NavKeyword2) ? null : request.NavKeyword2.Trim().ToLower(),
                CollectionId = request.CollectionId,
                SortOrder = sortOrder,
                CreatedBy = userContext.UserId ?? string.Empty,
                CreatedAt = DateTime.UtcNow,
            };

            db.FeaturedItems.Add(item);
            await db.SaveChangesAsync(cancellationToken);

            return Result.Success(new Response(item.Id));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Featured.AddFailed", $"Failed to add featured item: {ex.Message}"));
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
