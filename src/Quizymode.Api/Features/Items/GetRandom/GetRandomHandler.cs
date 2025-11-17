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
            IQueryable<Item> countQuery = db.Items.AsQueryable();

            if (!userContext.IsAuthenticated)
            {
                countQuery = countQuery.Where(i => !i.IsPrivate);
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
            
            // Build query using FromSqlInterpolated for safe parameterization
            // Use PostgreSQL's random() function for efficient random selection
            IQueryable<Item> randomQuery;
            
            if (!string.IsNullOrEmpty(request.Category) && !string.IsNullOrEmpty(request.Subcategory))
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       WHERE ""Category"" = {request.Category} 
                         AND ""Subcategory"" = {request.Subcategory} 
                       ORDER BY random() 
                       LIMIT {takeCount}");
            }
            else if (!string.IsNullOrEmpty(request.Category))
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       WHERE ""Category"" = {request.Category} 
                       ORDER BY random() 
                       LIMIT {takeCount}");
            }
            else if (!string.IsNullOrEmpty(request.Subcategory))
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       WHERE ""Subcategory"" = {request.Subcategory} 
                       ORDER BY random() 
                       LIMIT {takeCount}");
            }
            else
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       ORDER BY random() 
                       LIMIT {takeCount}");
            }
            
            List<Item> items = await randomQuery.ToListAsync(cancellationToken);

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

