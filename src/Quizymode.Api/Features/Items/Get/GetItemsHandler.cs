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

            // Apply visibility filter based on authentication and IsPrivate filter
            if (request.IsPrivate.HasValue)
            {
                // Explicit filter requested
                if (request.IsPrivate.Value)
                {
                    // User wants only private items - must be authenticated and can only see their own
                    if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                    {
                        return Result.Failure<GetItems.Response>(
                            Error.Problem("Items.Unauthorized", "Must be authenticated to view private items"));
                    }
                    query = query.Where(i => i.IsPrivate && i.CreatedBy == userContext.UserId);
                }
                else
                {
                    // User wants only global (non-private) items
                    query = query.Where(i => !i.IsPrivate);
                }
            }
            else
            {
                // No explicit filter - show based on user context
                // Anonymous users only see global items. Authenticated users see global + their private items.
                if (!userContext.IsAuthenticated)
                {
                    query = query.Where(i => !i.IsPrivate);
                }
                else if (!string.IsNullOrEmpty(userContext.UserId))
                {
                    // Include global items OR user's private items
                    query = query.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
                }
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

