using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Comments;

/// <summary>
/// Retrieves comments, optionally filtered by item id.
/// </summary>
public static class GetComments
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 100;

    public sealed record QueryRequest(Guid? ItemId, int Page = 1, int PageSize = DefaultPageSize);

    public sealed record CommentResponse(
        string Id,
        Guid ItemId,
        string Text,
        string CreatedBy,
        string? CreatedByName,
        DateTime CreatedAt,
        DateTime? UpdatedAt);

    /// <summary>One page of comments, newest first. <c>TotalCount</c> counts every comment the caller can see.</summary>
    public sealed record Response(List<CommentResponse> Comments, int TotalCount, int Page, int PageSize);

    public sealed class Validator : AbstractValidator<QueryRequest>
    {
        public Validator()
        {
            RuleFor(x => x.Page)
                .GreaterThanOrEqualTo(1)
                .WithMessage("Page must be greater than 0");
            RuleFor(x => x.PageSize)
                .InclusiveBetween(1, MaxPageSize)
                .WithMessage($"PageSize must be between 1 and {MaxPageSize}");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("comments", Handler)
                .WithTags("Comments")
                .WithSummary("Get comments")
                .WithDescription("Returns one page of comments, newest first, with the total count. Optionally filter by itemId using ?itemId={guid}. page defaults to 1; pageSize defaults to 50 (maximum 100).")
                .Produces<Response>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid? itemId,
            int? page,
            int? pageSize,
            IValidator<QueryRequest> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            QueryRequest request = new(itemId, page ?? 1, pageSize ?? DefaultPageSize);
            ValidationResult validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return CustomResults.BadRequest(validation.Errors[0].ErrorMessage);
            }

            Result<Response> result = await HandleAsync(request, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Comment> query = db.Comments.AsNoTracking();

            if (request.ItemId.HasValue && request.ItemId.Value != Guid.Empty)
            {
                // #293: an explicit item id must be readable by the caller; otherwise same as a missing id.
                bool interactable = await ItemVisibility.InteractableBy(db, userContext)
                    .AnyAsync(i => i.Id == request.ItemId.Value, cancellationToken);
                if (!interactable)
                {
                    return Result.Failure<Response>(
                        Error.NotFound("Comments.ItemNotFound", $"Item with id {request.ItemId.Value} not found"));
                }

                query = query.Where(c => c.ItemId == request.ItemId.Value);
            }
            else
            {
                // #285: listing all comments only exposes comments on items the caller can access by id.
                IQueryable<Guid> accessibleItemIds = db.Items
                    .Where(ItemVisibility.AccessibleById(userContext))
                    .Select(i => i.Id);
                query = query.Where(c => accessibleItemIds.Contains(c.ItemId));
            }

            // Counted on the same visibility-filtered query the page comes from.
            int totalCount = await query.CountAsync(cancellationToken);

            // long: a very large page number must not overflow into a wrong offset.
            long skip = (long)(request.Page - 1) * request.PageSize;
            List<Comment> comments = skip >= totalCount
                ? []
                : await query
                    .OrderByDescending(c => c.CreatedAt)
                    .ThenByDescending(c => c.Id)
                    .Skip((int)skip)
                    .Take(request.PageSize)
                    .ToListAsync(cancellationToken);

            // Get unique user IDs from comments and fetch user names
            List<Guid> userIds = comments
                .Select(c => c.CreatedBy)
                .Where(id => Guid.TryParse(id, out _))
                .Select(id => Guid.Parse(id))
                .Distinct()
                .ToList();

            Dictionary<string, string?> userNamesMap = new();
            if (userIds.Count > 0)
            {
                List<User> users = await db.Users
                    .Where(u => userIds.Contains(u.Id))
                    .ToListAsync(cancellationToken);

                userNamesMap = users.ToDictionary(
                    u => u.Id.ToString(),
                    u => u.Name);
            }

            List<CommentResponse> responseItems = comments
                .Select(c => new CommentResponse(
                    c.Id.ToString(),
                    c.ItemId,
                    c.Text,
                    c.CreatedBy,
                    userNamesMap.TryGetValue(c.CreatedBy, out string? name) ? name : null,
                    c.CreatedAt,
                    c.UpdatedAt))
                .ToList();

            Response response = new(responseItems, totalCount, request.Page, request.PageSize);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Comments.GetFailed", "Failed to get comments.", ex));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<QueryRequest>, Validator>();
        }
    }
}

