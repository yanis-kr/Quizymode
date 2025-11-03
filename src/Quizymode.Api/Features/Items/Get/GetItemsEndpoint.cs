using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

public static class GetItemsEndpoint
{
    public static void MapGetItemsEndpoint(this WebApplication app)
    {
        var group = app.MapGroup("/api/items")
            .WithTags("Items")
            .WithOpenApi();

        group.MapGet("/", GetItems)
            .WithName("GetItems")
            .WithSummary("Get quiz items with filtering and pagination")
            .Produces<PaginatedResult<ItemModel>>(200);
    }

    private static async Task<IResult> GetItems(
        [FromServices] GetItemsHandler handler,
        [FromQuery] string? categoryId,
        [FromQuery] string? subcategoryId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10
        )
    {
        return await handler.HandleAsync(categoryId, subcategoryId, page, pageSize);
    }
}
