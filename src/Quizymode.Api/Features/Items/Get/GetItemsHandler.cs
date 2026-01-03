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

            // Filter by category using CategoryId
            if (!string.IsNullOrEmpty(request.Category))
            {
                string categoryName = request.Category.Trim();
                
                // Resolve category name to CategoryId - try global first, then private
                Guid? categoryId = null;
                
                try
                {
                    // Try global category first (case-insensitive)
                    Category? globalCategory = await db.Categories
                        .FirstOrDefaultAsync(
                            c => !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(),
                            cancellationToken);
                    
                    if (globalCategory is not null)
                    {
                        categoryId = globalCategory.Id;
                    }
                    else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                    {
                        // Try user's private category
                        Category? privateCategory = await db.Categories
                            .FirstOrDefaultAsync(
                                c => c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == categoryName.ToLower(),
                                cancellationToken);
                        
                        if (privateCategory is not null)
                        {
                            categoryId = privateCategory.Id;
                        }
                    }
                }
                catch (NotSupportedException)
                {
                    // ILike not supported (e.g., InMemory database) - fetch and filter in memory
                    List<Category> allCategories = await db.Categories
                        .Where(c => !c.IsPrivate)
                        .ToListAsync(cancellationToken);
                    
                    Category? globalCategory = allCategories
                        .FirstOrDefault(c => string.Equals(c.Name, categoryName, StringComparison.OrdinalIgnoreCase));
                    
                    if (globalCategory is not null)
                    {
                        categoryId = globalCategory.Id;
                    }
                    else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                    {
                        List<Category> privateCategories = await db.Categories
                            .Where(c => c.IsPrivate && c.CreatedBy == userContext.UserId)
                            .ToListAsync(cancellationToken);
                        
                        Category? privateCategory = privateCategories
                            .FirstOrDefault(c => string.Equals(c.Name, categoryName, StringComparison.OrdinalIgnoreCase));
                        
                        if (privateCategory is not null)
                        {
                            categoryId = privateCategory.Id;
                        }
                    }
                }
                
                if (categoryId.HasValue)
                {
                    query = query.Where(i => i.CategoryId == categoryId.Value);
                }
                else
                {
                    // Category not found, return empty result
                    query = query.Where(i => false);
                }
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

            int totalCount;
            List<Item> items;
            
            try
            {
                totalCount = await query.CountAsync(cancellationToken);
                items = await query
                    .Include(i => i.ItemKeywords)
                        .ThenInclude(ik => ik.Keyword)
                    .Include(i => i.Category)
                    .Skip((request.Page - 1) * request.PageSize)
                    .Take(request.PageSize)
                    .ToListAsync(cancellationToken);
            }
            catch (Exception ex) when ((ex is NotSupportedException || ex is InvalidOperationException) && !string.IsNullOrEmpty(request.Category))
            {
                // ILike not supported (e.g., InMemory database) - fetch all and filter in memory
                IQueryable<Item> baseQuery = db.Items.AsQueryable();
                
                // Reapply visibility filters
                if (request.IsPrivate.HasValue)
                {
                    if (request.IsPrivate.Value)
                    {
                        if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
                        {
                            return Result.Failure<GetItems.Response>(
                                Error.Problem("Items.Unauthorized", "Must be authenticated to view private items"));
                        }
                        baseQuery = baseQuery.Where(i => i.IsPrivate && i.CreatedBy == userContext.UserId);
                    }
                    else
                    {
                        baseQuery = baseQuery.Where(i => !i.IsPrivate);
                    }
                }
                else
                {
                    if (!userContext.IsAuthenticated)
                    {
                        baseQuery = baseQuery.Where(i => !i.IsPrivate);
                    }
                    else if (!string.IsNullOrEmpty(userContext.UserId))
                    {
                        baseQuery = baseQuery.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
                    }
                }
                
                // Fetch all items with keywords and category
                List<Item> allItems = await baseQuery
                    .Include(i => i.ItemKeywords)
                        .ThenInclude(ik => ik.Keyword)
                    .Include(i => i.Category)
                    .ToListAsync(cancellationToken);
                
                // Apply category filter in memory
                if (!string.IsNullOrEmpty(request.Category))
                {
                    string categoryName = request.Category.Trim();
                    allItems = allItems.Where(i => 
                        i.Category is not null &&
                        string.Equals(i.Category.Name, categoryName, StringComparison.OrdinalIgnoreCase)).ToList();
                }
                
                // Apply keyword filter
                if (request.Keywords is not null && request.Keywords.Count > 0)
                {
                    List<string> visibleKeywordNames = await db.Keywords
                        .Where(k => request.Keywords.Contains(k.Name) && 
                                   (!k.IsPrivate || (k.IsPrivate && !string.IsNullOrEmpty(userContext.UserId) && k.CreatedBy == userContext.UserId)))
                        .Select(k => k.Name)
                        .ToListAsync(cancellationToken);
                    
                    if (visibleKeywordNames.Count > 0)
                    {
                        HashSet<Guid> visibleKeywordIds = await db.Keywords
                            .Where(k => visibleKeywordNames.Contains(k.Name))
                            .Select(k => k.Id)
                            .ToHashSetAsync(cancellationToken);
                        
                        allItems = allItems.Where(i => i.ItemKeywords.Any(ik => visibleKeywordIds.Contains(ik.KeywordId))).ToList();
                    }
                    else
                    {
                        allItems = new List<Item>();
                    }
                }
                
                totalCount = allItems.Count;
                items = allItems
                    .Skip((request.Page - 1) * request.PageSize)
                    .Take(request.PageSize)
                    .ToList();
            }

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

                // Get category name from Category navigation
                string categoryName = item.Category?.Name ?? string.Empty;

                itemResponses.Add(new GetItems.ItemResponse(
                    item.Id.ToString(),
                    categoryName,
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

