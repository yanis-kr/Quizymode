using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
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
                // Case-insensitive category filter
                string normalizedCategory = CategoryHelper.Normalize(request.Category);
                query = query.Where(i => EF.Functions.ILike(i.Category, normalizedCategory));
            }

            if (!string.IsNullOrEmpty(request.Subcategory))
            {
                // Case-insensitive subcategory filter
                string normalizedSubcategory = CategoryHelper.Normalize(request.Subcategory);
                query = query.Where(i => EF.Functions.ILike(i.Subcategory, normalizedSubcategory));
            }

            // Filter by keywords if provided
            if (request.Keywords is not null && request.Keywords.Count > 0)
            {
                // Get keywords that are visible to the user
                IQueryable<Keyword> keywordQuery = db.Keywords.AsQueryable();
                
                if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                {
                    // Anonymous users can only see global keywords
                    keywordQuery = keywordQuery.Where(k => !k.IsPrivate);
                }
                else
                {
                    // Authenticated users can see global keywords OR their own private keywords
                    keywordQuery = keywordQuery.Where(k => !k.IsPrivate || (k.IsPrivate && k.CreatedBy == userContext.UserId));
                }

                List<Guid> visibleKeywordIds = await keywordQuery
                    .Where(k => request.Keywords.Contains(k.Name))
                    .Select(k => k.Id)
                    .ToListAsync(cancellationToken);

                if (visibleKeywordIds.Count > 0)
                {
                    // Filter items that have at least one of the requested keywords
                    query = query.Where(i => i.ItemKeywords.Any(ik => visibleKeywordIds.Contains(ik.KeywordId)));
                }
                else
                {
                    // No visible keywords found, return empty result
                    query = query.Where(i => false);
                }
            }

            int totalCount = await query.CountAsync(cancellationToken);
            List<Item> items = await query
                .Include(i => i.ItemKeywords)
                    .ThenInclude(ik => ik.Keyword)
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
                .ToListAsync(cancellationToken);

            // Filter keywords based on visibility for each item
            List<GetItems.ItemResponse> itemResponses = new();
            foreach (Item item in items)
            {
                List<GetItems.KeywordResponse> visibleKeywords = new();
                
                foreach (ItemKeyword itemKeyword in item.ItemKeywords)
                {
                    Keyword keyword = itemKeyword.Keyword;
                    
                    // Check if keyword is visible to current user
                    bool isVisible = false;
                    if (!keyword.IsPrivate)
                    {
                        // Global keyword - visible to everyone
                        isVisible = true;
                    }
                    else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                    {
                        // Private keyword - only visible to creator
                        isVisible = keyword.CreatedBy == userContext.UserId;
                    }

                    if (isVisible)
                    {
                        visibleKeywords.Add(new GetItems.KeywordResponse(
                            keyword.Id.ToString(),
                            keyword.Name,
                            keyword.IsPrivate));
                    }
                }

                itemResponses.Add(new GetItems.ItemResponse(
                    item.Id.ToString(),
                    item.Category,
                    item.Subcategory,
                    item.IsPrivate,
                    item.Question,
                    item.CorrectAnswer,
                    item.IncorrectAnswers,
                    item.Explanation,
                    item.CreatedAt,
                    visibleKeywords));
            }

            GetItems.Response response = new GetItems.Response(
                itemResponses,
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

