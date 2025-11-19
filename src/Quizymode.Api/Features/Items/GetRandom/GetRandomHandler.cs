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

            if (!string.IsNullOrEmpty(request.Category))
            {
                countQuery = countQuery.Where(i => i.Category == request.Category);
            }

            if (!string.IsNullOrEmpty(request.Subcategory))
            {
                countQuery = countQuery.Where(i => i.Subcategory == request.Subcategory);
            }

            // Get count to validate and limit the request
            int totalCount = await countQuery.CountAsync(cancellationToken);
            
            if (totalCount == 0)
            {
                return Result.Success(new GetRandom.Response(new List<GetRandom.ItemResponse>()));
            }

            // Limit the count to available items
            int takeCount = Math.Min(request.Count, totalCount);
            
            // Build query using LINQ for better control over private items filtering
            // Use PostgreSQL's random() function for efficient random selection
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

            // Apply category/subcategory filters
            if (!string.IsNullOrEmpty(request.Category) && !string.IsNullOrEmpty(request.Subcategory))
            {
                baseQuery = baseQuery.Where(i => i.Category == request.Category && i.Subcategory == request.Subcategory);
            }
            else if (!string.IsNullOrEmpty(request.Category))
            {
                baseQuery = baseQuery.Where(i => i.Category == request.Category);
            }
            else if (!string.IsNullOrEmpty(request.Subcategory))
            {
                baseQuery = baseQuery.Where(i => i.Subcategory == request.Subcategory);
            }

            // Get random items using EF Core
            List<Item> items = await baseQuery
                .OrderBy(_ => Guid.NewGuid()) // Random ordering
                .Take(takeCount)
                .ToListAsync(cancellationToken);

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

