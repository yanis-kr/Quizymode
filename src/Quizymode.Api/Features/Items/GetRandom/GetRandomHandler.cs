using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.GetRandom;

internal static class GetRandomHandler
{
    public static async Task<Result<GetRandom.Response>> HandleAsync(
        GetRandom.QueryRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            // Build a query to count available items for validation
            // Anonymous users: only global items (IsPrivate = false)
            // Authenticated users: global items + their own private items
            IQueryable<Item> countQuery = db.Items.AsQueryable();

            if (!userContext.IsAuthenticated)
            {
                countQuery = countQuery.Where(i => !i.IsPrivate);
            }
            else if (!string.IsNullOrEmpty(userContext.UserId))
            {
                // Include global items OR user's private items
                countQuery = countQuery.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
            }

            // Prepare category for filtering via CategoryId
            string categoryName = !string.IsNullOrEmpty(request.Category) ? request.Category.Trim() : string.Empty;

            if (!string.IsNullOrEmpty(categoryName))
            {
                // Filter by category using CategoryId
                // Resolve category name to CategoryId - try global first, then private
                Guid? categoryId = null;
                
                // Use database-agnostic case-insensitive comparison
                string categoryNameLower = categoryName.ToLower();
                Category? globalCategory = await db.Categories
                    .FirstOrDefaultAsync(
                        c => !c.IsPrivate && c.Name.ToLower() == categoryNameLower,
                        cancellationToken);
                
                if (globalCategory is not null)
                {
                    categoryId = globalCategory.Id;
                }
                else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                {
                    Category? privateCategory = await db.Categories
                        .FirstOrDefaultAsync(
                            c => c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == categoryNameLower,
                            cancellationToken);
                    
                    if (privateCategory is not null)
                    {
                        categoryId = privateCategory.Id;
                    }
                }
                
                if (categoryId.HasValue)
                {
                    countQuery = countQuery.Where(i => i.CategoryId == categoryId.Value);
                }
                else
                {
                    // Category not found, return empty
                    return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
                }
            }

            // Get count to validate and limit the request
            int totalCount;
            int takeCount;
            List<Item> items;
            
            try
            {
                totalCount = await countQuery.CountAsync(cancellationToken);
                
                if (totalCount == 0)
                {
                    return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
                }

                // Limit the count to available items
                takeCount = Math.Min(request.Count, totalCount);
                
                // Build query using LINQ for better control over private items filtering
                IQueryable<Item> baseQuery = db.Items.AsQueryable();

                // Apply visibility filter
                if (!userContext.IsAuthenticated)
                {
                    baseQuery = baseQuery.Where(i => !i.IsPrivate);
                }
                else if (!string.IsNullOrEmpty(userContext.UserId))
                {
                    // Include global items OR user's private items
                    baseQuery = baseQuery.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
                }

                // Apply category filter via CategoryId
                if (!string.IsNullOrEmpty(categoryName))
                {
                    Guid? categoryId = null;
                    try
                    {
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
                        baseQuery = baseQuery.Where(i => i.CategoryId == categoryId.Value);
                    }
                    else
                    {
                        return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
                    }
                }

                // Get random items - fetch all first, then randomize in memory for SQLite compatibility
                List<Item> allItems = await baseQuery
                    .Include(i => i.Category)
                    .ToListAsync(cancellationToken);
                
                // Randomize in memory (SQLite doesn't support Guid.NewGuid() in OrderBy)
                Random random = new Random();
                items = allItems
                    .OrderBy(_ => random.Next())
                    .Take(takeCount)
                    .ToList();
            }
            catch (Exception ex) when ((ex is NotSupportedException || ex is InvalidOperationException) && !string.IsNullOrEmpty(categoryName))
            {
                // ILike not supported (e.g., InMemory database) - fetch all and filter in memory
                IQueryable<Item> baseQuery = db.Items.AsQueryable();
                
                // Apply visibility filter
                if (!userContext.IsAuthenticated)
                {
                    baseQuery = baseQuery.Where(i => !i.IsPrivate);
                }
                else if (!string.IsNullOrEmpty(userContext.UserId))
                {
                    baseQuery = baseQuery.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
                }
                
                // Fetch all items with category
                List<Item> allItems = await baseQuery
                    .Include(i => i.Category)
                    .ToListAsync(cancellationToken);
                
                // Apply category filter in memory
                if (!string.IsNullOrEmpty(categoryName))
                {
                    allItems = allItems.Where(i => 
                        i.Category is not null &&
                        string.Equals(i.Category.Name, categoryName, StringComparison.OrdinalIgnoreCase)).ToList();
                }
                
                totalCount = allItems.Count;
                takeCount = Math.Min(request.Count, totalCount);
                
                // Get random items
                Random random = new Random();
                items = allItems
                    .OrderBy(_ => random.Next())
                    .Take(takeCount)
                    .ToList();
            }

            GetRandom.Response response = new GetRandom.Response(
                items.Select(i => 
                {
                    string categoryName = i.Category?.Name ?? string.Empty;
                    
                    return new GetRandom.ItemResponse(
                        i.Id.ToString(),
                        categoryName,
                        i.IsPrivate,
                        i.Question,
                        i.CorrectAnswer,
                        i.IncorrectAnswers,
                        i.Explanation,
                        i.CreatedAt);
                }).ToList());

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<GetRandom.Response>(
                Error.Problem("Items.GetRandomFailed", $"Failed to get random items: {ex.Message}"));
        }
    }
}

