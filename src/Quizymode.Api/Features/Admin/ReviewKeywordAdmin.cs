using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class ReviewKeywordAdmin
{
    public sealed record KeywordReviewResponse(
        Guid Id,
        string Name,
        string? Slug,
        bool IsPrivate,
        bool IsReviewPending,
        DateTime CreatedAt,
        DateTime? ReviewedAt,
        string? ReviewedBy);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/keywords/{id:guid}/approve", ApproveHandler)
                .WithTags("Admin")
                .WithSummary("Approve a private keyword (Admin only)")
                .WithDescription("Marks a private keyword as public and clears review-pending state so it no longer appears in the review list.")
                .RequireAuthorization("Admin")
                .Produces<KeywordReviewResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);

            app.MapPost("admin/keywords/{id:guid}/reject", RejectHandler)
                .WithTags("Admin")
                .WithSummary("Reject a private keyword (Admin only)")
                .WithDescription("Keeps the keyword private but clears review-pending state so it no longer appears in the review list.")
                .RequireAuthorization("Admin")
                .Produces<KeywordReviewResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }
    }

    private static async Task<IResult> ApproveHandler(
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Result<KeywordReviewResponse> result = await ApproveAsync(id, db, userContext, cancellationToken);
        return result.Match(
            value => Results.Ok(value),
            failure => failure.Error.Code == "Admin.KeywordNotFound"
                ? Results.NotFound()
                : CustomResults.Problem(result));
    }

    private static async Task<IResult> RejectHandler(
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Result<KeywordReviewResponse> result = await RejectAsync(id, db, userContext, cancellationToken);
        return result.Match(
            value => Results.Ok(value),
            failure => failure.Error.Code == "Admin.KeywordNotFound"
                ? Results.NotFound()
                : CustomResults.Problem(result));
    }

    public static async Task<Result<KeywordReviewResponse>> ApproveAsync(
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Keyword? keyword = await db.Keywords.FirstOrDefaultAsync(k => k.Id == id, cancellationToken);
        if (keyword is null)
        {
            return Result.Failure<KeywordReviewResponse>(
                Error.NotFound("Admin.KeywordNotFound", "Keyword not found"));
        }

        keyword.IsPrivate = false;
        keyword.IsReviewPending = false;
        keyword.ReviewedAt = DateTime.UtcNow;
        keyword.ReviewedBy = userContext.UserId ?? "admin";

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(ToResponse(keyword));
    }

    public static async Task<Result<KeywordReviewResponse>> RejectAsync(
        Guid id,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        Keyword? keyword = await db.Keywords.FirstOrDefaultAsync(k => k.Id == id, cancellationToken);
        if (keyword is null)
        {
            return Result.Failure<KeywordReviewResponse>(
                Error.NotFound("Admin.KeywordNotFound", "Keyword not found"));
        }

        keyword.IsReviewPending = false;
        keyword.ReviewedAt = DateTime.UtcNow;
        keyword.ReviewedBy = userContext.UserId ?? "admin";

        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(ToResponse(keyword));
    }

    private static KeywordReviewResponse ToResponse(Keyword keyword) =>
        new(
            keyword.Id,
            keyword.Name,
            keyword.Slug,
            keyword.IsPrivate,
            keyword.IsReviewPending,
            keyword.CreatedAt,
            keyword.ReviewedAt,
            keyword.ReviewedBy);
}

