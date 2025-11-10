using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

internal static class GetItemsHandler
{
    public static async Task<Result<GetItems.Response>> HandleAsync(
        GetItems.QueryRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Item> query = db.Items.AsQueryable();

            if (!string.IsNullOrEmpty(request.CategoryId))
            {
                query = query.Where(i => i.CategoryId == request.CategoryId);
            }

            if (!string.IsNullOrEmpty(request.SubcategoryId))
            {
                query = query.Where(i => i.SubcategoryId == request.SubcategoryId);
            }

            int totalCount = await query.CountAsync(cancellationToken);
            List<Item> items = await query
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync(cancellationToken);

            GetItems.Response response = new GetItems.Response(
                items.Select(i => new GetItems.ItemResponse(
                    i.Id.ToString(),
                    i.CategoryId,
                    i.SubcategoryId,
                    i.IsPrivate,
                    i.Question,
                    i.CorrectAnswer,
                    i.IncorrectAnswers,
                    i.Explanation,
                    i.CreatedAt)).ToList(),
                totalCount,
                request.Page,
                request.PageSize,
                (int)Math.Ceiling((double)totalCount / request.PageSize));

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<GetItems.Response>(
                Error.Problem("Items.GetFailed", $"Failed to get items: {ex.Message}"));
        }
    }
}

