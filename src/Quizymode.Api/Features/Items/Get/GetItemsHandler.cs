using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

internal static class GetItemsHandler
{
    public static async Task<Result<GetItems.Response>> HandleAsync(
        GetItems.QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            IQueryable<Item> query = db.Items.AsQueryable();

            // Anonymous users only see global items. Authenticated users see global + their private items.
            if (!userContext.IsAuthenticated)
            {
                query = query.Where(i => !i.IsPrivate);
            }

            if (!string.IsNullOrEmpty(request.Category))
            {
                query = query.Where(i => i.Category == request.Category);
            }

            if (!string.IsNullOrEmpty(request.Subcategory))
            {
                query = query.Where(i => i.Subcategory == request.Subcategory);
            }

            int totalCount = await query.CountAsync(cancellationToken);
            List<Item> items = await query
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync(cancellationToken);

            GetItems.Response response = new GetItems.Response(
                items.Select(i => new GetItems.ItemResponse(
                    i.Id.ToString(),
                    i.Category,
                    i.Subcategory,
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

