using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class GetPendingKeywordsAdmin
{
    public sealed record PendingKeywordResponse(
        Guid Id,
        string Name,
        string? Slug,
        bool IsPrivate,
        string CreatedBy,
        DateTime CreatedAt,
        int UsageCount);

    public sealed record Response(List<PendingKeywordResponse> Keywords);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/keywords/pending", Handler)
                .WithTags("Admin")
                .WithSummary("List private keywords pending review (Admin only)")
                .WithDescription("Returns private keywords that are marked as review-pending so admins can approve or reject them.")
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
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            List<PendingKeywordResponse> list = await db.Keywords
                .Where(k => k.IsPrivate && k.IsReviewPending)
                .Select(k => new
                {
                    Keyword = k,
                    UsageCount = db.ItemKeywords.Count(ik => ik.KeywordId == k.Id)
                })
                .OrderBy(x => x.Keyword.CreatedAt)
                .ThenBy(x => x.Keyword.Name)
                .Select(x => new PendingKeywordResponse(
                    x.Keyword.Id,
                    x.Keyword.Name,
                    x.Keyword.Slug,
                    x.Keyword.IsPrivate,
                    x.Keyword.CreatedBy,
                    x.Keyword.CreatedAt,
                    x.UsageCount))
                .ToListAsync(cancellationToken);

            return Result.Success(new Response(list));
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Admin.GetPendingKeywordsFailed", $"Failed to get pending keywords: {ex.Message}"));
        }
    }
}

