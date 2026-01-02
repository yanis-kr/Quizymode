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
            IQueryable<Item> countQuery = db.Items
                .Include(i => i.CategoryItems)
                .AsQueryable();

            if (!userContext.IsAuthenticated)
            {
                countQuery = countQuery.Where(i => !i.IsPrivate);
            }
            else if (!string.IsNullOrEmpty(userContext.UserId))
            {
                // Include global items OR user's private items
                countQuery = countQuery.Where(i => !i.IsPrivate || (i.IsPrivate && i.CreatedBy == userContext.UserId));
            }

            // Prepare category and subcategory for filtering via CategoryItems
            string categoryName = !string.IsNullOrEmpty(request.Category) ? request.Category.Trim() : string.Empty;
            string subcategoryName = !string.IsNullOrEmpty(request.Subcategory) ? request.Subcategory.Trim() : string.Empty;

            if (!string.IsNullOrEmpty(categoryName))
            {
                // Filter by category using CategoryItems
                // Resolve category name to CategoryId(s) - try global first, then private
                List<Guid> categoryIds = new();
                
                // Use database-agnostic case-insensitive comparison
                string categoryNameLower = categoryName.ToLower();
                Category? globalCategory = await db.Categories
                    .FirstOrDefaultAsync(
                        c => c.Depth == 1 && !c.IsPrivate && c.Name.ToLower() == categoryNameLower,
                        cancellationToken);
                
                if (globalCategory is not null)
                {
                    categoryIds.Add(globalCategory.Id);
                }
                else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                {
                    Category? privateCategory = await db.Categories
                        .FirstOrDefaultAsync(
                            c => c.Depth == 1 && c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == categoryNameLower,
                            cancellationToken);
                    
                    if (privateCategory is not null)
                    {
                        categoryIds.Add(privateCategory.Id);
                    }
                }
                
                if (categoryIds.Count > 0)
                {
                    countQuery = countQuery.Where(i => i.CategoryItems.Any(ci => categoryIds.Contains(ci.CategoryId)));
                }
                else
                {
                    // Category not found, return empty
                    return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
                }
            }

            if (!string.IsNullOrEmpty(subcategoryName))
            {
                // Filter by subcategory using CategoryItems
                List<Guid> subcategoryIds = new();
                
                // Use database-agnostic case-insensitive comparison
                string subcategoryNameLower = subcategoryName.ToLower();
                Category? globalSubcategory = await db.Categories
                    .FirstOrDefaultAsync(
                        c => c.Depth == 2 && !c.IsPrivate && c.Name.ToLower() == subcategoryNameLower,
                        cancellationToken);
                
                if (globalSubcategory is not null)
                {
                    subcategoryIds.Add(globalSubcategory.Id);
                }
                else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                {
                    Category? privateSubcategory = await db.Categories
                        .FirstOrDefaultAsync(
                            c => c.Depth == 2 && c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == subcategoryNameLower,
                            cancellationToken);
                    
                    if (privateSubcategory is not null)
                    {
                        subcategoryIds.Add(privateSubcategory.Id);
                    }
                }
                
                if (subcategoryIds.Count > 0)
                {
                    countQuery = countQuery.Where(i => i.CategoryItems.Any(ci => subcategoryIds.Contains(ci.CategoryId)));
                }
                else
                {
                    // Subcategory not found, return empty
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

                // Apply category/subcategory filters via CategoryItems
                if (!string.IsNullOrEmpty(categoryName))
                {
                    List<Guid> categoryIds = new();
                    try
                    {
                        Category? globalCategory = await db.Categories
                            .FirstOrDefaultAsync(
                                c => c.Depth == 1 && !c.IsPrivate && c.Name.ToLower() == categoryName.ToLower(),
                                cancellationToken);
                        if (globalCategory is not null)
                        {
                            categoryIds.Add(globalCategory.Id);
                        }
                        else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                        {
                            Category? privateCategory = await db.Categories
                                .FirstOrDefaultAsync(
                                    c => c.Depth == 1 && c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == categoryName.ToLower(),
                                    cancellationToken);
                            if (privateCategory is not null)
                            {
                                categoryIds.Add(privateCategory.Id);
                            }
                        }
                    }
                    catch (NotSupportedException)
                    {
                        // ILike not supported (e.g., InMemory database) - fetch and filter in memory
                        List<Category> allCategories = await db.Categories
                            .Where(c => c.Depth == 1 && !c.IsPrivate)
                            .ToListAsync(cancellationToken);
                        
                        Category? globalCategory = allCategories
                            .FirstOrDefault(c => string.Equals(c.Name, categoryName, StringComparison.OrdinalIgnoreCase));
                        
                        if (globalCategory is not null)
                        {
                            categoryIds.Add(globalCategory.Id);
                        }
                        else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                        {
                            List<Category> privateCategories = await db.Categories
                                .Where(c => c.Depth == 1 && c.IsPrivate && c.CreatedBy == userContext.UserId)
                                .ToListAsync(cancellationToken);
                            
                            Category? privateCategory = privateCategories
                                .FirstOrDefault(c => string.Equals(c.Name, categoryName, StringComparison.OrdinalIgnoreCase));
                            
                            if (privateCategory is not null)
                            {
                                categoryIds.Add(privateCategory.Id);
                            }
                        }
                    }
                    if (categoryIds.Count > 0)
                    {
                        baseQuery = baseQuery.Where(i => i.CategoryItems.Any(ci => categoryIds.Contains(ci.CategoryId)));
                    }
                    else
                    {
                        return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
                    }
                }

                if (!string.IsNullOrEmpty(subcategoryName))
                {
                    List<Guid> subcategoryIds = new();
                    // Use database-agnostic case-insensitive comparison
                    string subcategoryNameLower = subcategoryName.ToLower();
                    Category? globalSubcategory = await db.Categories
                        .FirstOrDefaultAsync(
                            c => c.Depth == 2 && !c.IsPrivate && c.Name.ToLower() == subcategoryNameLower,
                            cancellationToken);
                    if (globalSubcategory is not null)
                    {
                        subcategoryIds.Add(globalSubcategory.Id);
                    }
                    else if (userContext.IsAuthenticated && !string.IsNullOrEmpty(userContext.UserId))
                    {
                        Category? privateSubcategory = await db.Categories
                            .FirstOrDefaultAsync(
                                c => c.Depth == 2 && c.IsPrivate && c.CreatedBy == userContext.UserId && c.Name.ToLower() == subcategoryNameLower,
                                cancellationToken);
                        if (privateSubcategory is not null)
                        {
                            subcategoryIds.Add(privateSubcategory.Id);
                        }
                    }
                    if (subcategoryIds.Count > 0)
                    {
                        baseQuery = baseQuery.Where(i => i.CategoryItems.Any(ci => subcategoryIds.Contains(ci.CategoryId)));
                    }
                    else
                    {
                        return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
                    }
                }

                // Get random items - fetch all first, then randomize in memory for SQLite compatibility
                List<Item> allItems = await baseQuery
                    .Include(i => i.CategoryItems)
                    .ThenInclude(ci => ci.Category)
                    .ToListAsync(cancellationToken);
                
                // Randomize in memory (SQLite doesn't support Guid.NewGuid() in OrderBy)
                Random random = new Random();
                items = allItems
                    .OrderBy(_ => random.Next())
                    .Take(takeCount)
                    .ToList();
            }
            catch (Exception ex) when ((ex is NotSupportedException || ex is InvalidOperationException) && (!string.IsNullOrEmpty(categoryName) || !string.IsNullOrEmpty(subcategoryName)))
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
                
                // Fetch all items
                List<Item> allItems = await baseQuery.ToListAsync(cancellationToken);
                
                // Fetch items with CategoryItems for filtering
                allItems = await baseQuery
                    .Include(i => i.CategoryItems)
                    .ThenInclude(ci => ci.Category)
                    .ToListAsync(cancellationToken);
                
                // Apply category/subcategory filters in memory using CategoryItems
                if (!string.IsNullOrEmpty(categoryName) && !string.IsNullOrEmpty(subcategoryName))
                {
                    allItems = allItems.Where(i => 
                        i.CategoryItems.Any(ci => ci.Category.Depth == 1 && string.Equals(ci.Category.Name, categoryName, StringComparison.OrdinalIgnoreCase)) &&
                        i.CategoryItems.Any(ci => ci.Category.Depth == 2 && string.Equals(ci.Category.Name, subcategoryName, StringComparison.OrdinalIgnoreCase))).ToList();
                }
                else if (!string.IsNullOrEmpty(categoryName))
                {
                    allItems = allItems.Where(i => 
                        i.CategoryItems.Any(ci => ci.Category.Depth == 1 && string.Equals(ci.Category.Name, categoryName, StringComparison.OrdinalIgnoreCase))).ToList();
                }
                else if (!string.IsNullOrEmpty(subcategoryName))
                {
                    allItems = allItems.Where(i => 
                        i.CategoryItems.Any(ci => ci.Category.Depth == 2 && string.Equals(ci.Category.Name, subcategoryName, StringComparison.OrdinalIgnoreCase))).ToList();
                }
                
                totalCount = allItems.Count;
                takeCount = Math.Min(request.Count, totalCount);
                
                // Get random items
                items = allItems
                    .OrderBy(_ => Guid.NewGuid())
                    .Take(takeCount)
                    .ToList();
            }

            GetRandom.Response response = new GetRandom.Response(
                items.Select(i => 
                {
                    string categoryName = i.CategoryItems
                        .Where(ci => ci.Category.Depth == 1)
                        .Select(ci => ci.Category.Name)
                        .FirstOrDefault() ?? string.Empty;
                    
                    string subcategoryName = i.CategoryItems
                        .Where(ci => ci.Category.Depth == 2)
                        .Select(ci => ci.Category.Name)
                        .FirstOrDefault() ?? string.Empty;
                    
                    return new GetRandom.ItemResponse(
                        i.Id.ToString(),
                        categoryName,
                        subcategoryName,
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

