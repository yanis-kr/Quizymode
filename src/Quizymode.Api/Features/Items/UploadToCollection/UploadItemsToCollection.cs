using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.UploadToCollection;

public static class UploadItemsToCollection
{
    public sealed record Request(List<AddItemsBulk.ItemRequest> Items);

    public sealed record Response(
        string CollectionId,
        string Name,
        int ItemCount);

    public sealed class Validator : AbstractValidator<Request>
    {
        private readonly IUserContext _userContext;

        public Validator(IUserContext userContext)
        {
            _userContext = userContext;
            int maxItems = _userContext.IsAdmin ? 1000 : 100;
            RuleFor(x => x.Items)
                .NotNull()
                .WithMessage("Items is required")
                .Must(items => items.Count > 0)
                .WithMessage("At least one item is required")
                .Must(items => items.Count <= maxItems)
                .WithMessage($"Cannot upload more than {maxItems} items at once");
            RuleForEach(x => x.Items)
                .SetValidator(new AddItemsBulk.ItemRequestValidator());
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("items/upload-to-collection", Handler)
                .WithTags("Items")
                .WithSummary("Upload JSON items into a new collection")
                .WithDescription("Creates items (private for non-admin) and a new collection with a unique GUID name, adds items to it. Returns collection ID to navigate. URL is shareable.")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            ISimHashService simHashService,
            IUserContext userContext,
            ICategoryResolver categoryResolver,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, simHashService, userContext, categoryResolver, auditService, cancellationToken);

            return result.Match(
                value => Results.Created($"/api/collections/{value.CollectionId}", value),
                failure => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        ApplicationDbContext db,
        ISimHashService simHashService,
        IUserContext userContext,
        ICategoryResolver categoryResolver,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        bool isPrivate = !userContext.IsAdmin;
        AddItemsBulk.Request bulkRequest = new(IsPrivate: isPrivate, Items: request.Items);

        Result<AddItemsBulk.Response> bulkResult = await AddItemsBulkHandler.HandleAsync(
            bulkRequest, db, simHashService, userContext, categoryResolver, auditService, cancellationToken);

        if (bulkResult.IsFailure)
        {
            return Result.Failure<Response>(bulkResult.Error!);
        }

        AddItemsBulk.Response bulkResponse = bulkResult.Value!;
        List<Guid>? createdIds = bulkResponse.CreatedItemIds;
        if (createdIds is null || createdIds.Count == 0)
        {
            return Result.Failure<Response>(
                Error.Validation("Upload.NoItemsCreated", "No items were created. Check for duplicates or validation errors."));
        }

        string collectionName = Guid.NewGuid().ToString("N");
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = collectionName,
            CreatedBy = userContext.UserId!,
            CreatedAt = DateTime.UtcNow
        };
        db.Collections.Add(collection);
        await db.SaveChangesAsync(cancellationToken);

        Result<CollectionItems.BulkAddResponse> addResult = await CollectionItems.HandleBulkAddAsync(
            collection.Id,
            new CollectionItems.BulkAddRequest(createdIds),
            db,
            userContext,
            cancellationToken);

        if (addResult.IsFailure)
        {
            return Result.Failure<Response>(addResult.Error!);
        }

        return Result.Success(new Response(
            collection.Id.ToString(),
            collection.Name,
            createdIds.Count));
    }
}
