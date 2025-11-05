using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.GetRandom;

internal static class GetRandomHandler
{
    public static async Task<Result<GetRandom.Response>> HandleAsync(
        GetRandom.QueryRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        try
        {
            // Build a query to count available items for validation
            IQueryable<Item> countQuery = db.Items.AsQueryable();

            if (!string.IsNullOrEmpty(request.CategoryId))
            {
                countQuery = countQuery.Where(i => i.CategoryId == request.CategoryId);
            }

            if (!string.IsNullOrEmpty(request.SubcategoryId))
            {
                countQuery = countQuery.Where(i => i.SubcategoryId == request.SubcategoryId);
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
            
            if (!string.IsNullOrEmpty(request.CategoryId) && !string.IsNullOrEmpty(request.SubcategoryId))
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       WHERE ""CategoryId"" = {request.CategoryId} 
                         AND ""SubcategoryId"" = {request.SubcategoryId} 
                       ORDER BY random() 
                       LIMIT {takeCount}");
            }
            else if (!string.IsNullOrEmpty(request.CategoryId))
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       WHERE ""CategoryId"" = {request.CategoryId} 
                       ORDER BY random() 
                       LIMIT {takeCount}");
            }
            else if (!string.IsNullOrEmpty(request.SubcategoryId))
            {
                randomQuery = db.Items.FromSqlInterpolated(
                    $@"SELECT * FROM ""items"" 
                       WHERE ""SubcategoryId"" = {request.SubcategoryId} 
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
                    i.CategoryId,
                    i.SubcategoryId,
                    i.Visibility,
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

