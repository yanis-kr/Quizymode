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

            // Prepare category and subcategory for case-insensitive filtering
            string category = !string.IsNullOrEmpty(request.Category) ? request.Category.Trim() : string.Empty;
            string subcategory = !string.IsNullOrEmpty(request.Subcategory) ? request.Subcategory.Trim() : string.Empty;

            if (!string.IsNullOrEmpty(category))
            {
                // Case-insensitive category filter
                countQuery = countQuery.Where(i => EF.Functions.ILike(i.Category, category));
            }

            if (!string.IsNullOrEmpty(subcategory))
            {
                // Case-insensitive subcategory filter
                countQuery = countQuery.Where(i => EF.Functions.ILike(i.Subcategory, subcategory));
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

                // Apply category/subcategory filters (case-insensitive) - reuse variables from above
                if (!string.IsNullOrEmpty(category) && !string.IsNullOrEmpty(subcategory))
                {
                    baseQuery = baseQuery.Where(i => 
                        EF.Functions.ILike(i.Category, category) && 
                        EF.Functions.ILike(i.Subcategory, subcategory));
                }
                else if (!string.IsNullOrEmpty(category))
                {
                    baseQuery = baseQuery.Where(i => EF.Functions.ILike(i.Category, category));
                }
                else if (!string.IsNullOrEmpty(subcategory))
                {
                    baseQuery = baseQuery.Where(i => EF.Functions.ILike(i.Subcategory, subcategory));
                }

                // Get random items using EF Core
                items = await baseQuery
                    .OrderBy(_ => Guid.NewGuid()) // Random ordering
                    .Take(takeCount)
                    .ToListAsync(cancellationToken);
            }
            catch (Exception ex) when ((ex is NotSupportedException || ex is InvalidOperationException) && (!string.IsNullOrEmpty(category) || !string.IsNullOrEmpty(subcategory)))
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
                
                // Apply category/subcategory filters in memory
                if (!string.IsNullOrEmpty(category) && !string.IsNullOrEmpty(subcategory))
                {
                    allItems = allItems.Where(i => 
                        string.Equals(i.Category, category, StringComparison.OrdinalIgnoreCase) && 
                        string.Equals(i.Subcategory, subcategory, StringComparison.OrdinalIgnoreCase)).ToList();
                }
                else if (!string.IsNullOrEmpty(category))
                {
                    allItems = allItems.Where(i => string.Equals(i.Category, category, StringComparison.OrdinalIgnoreCase)).ToList();
                }
                else if (!string.IsNullOrEmpty(subcategory))
                {
                    allItems = allItems.Where(i => string.Equals(i.Subcategory, subcategory, StringComparison.OrdinalIgnoreCase)).ToList();
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
                items.Select(i => new GetRandom.ItemResponse(
                    i.Id.ToString(),
                    i.Category,
                    i.Subcategory,
                    i.IsPrivate,
                    i.Question,
                    i.CorrectAnswer,
                    i.IncorrectAnswers,
                    i.Explanation,
                    i.CreatedAt)).ToList());

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<GetRandom.Response>(
                Error.Problem("Items.GetRandomFailed", $"Failed to get random items: {ex.Message}"));
        }
    }
}

