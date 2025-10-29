using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Add;

public static class AddItemsEndpoint
{
    public static void MapAddItemsEndpoint(this WebApplication app)
    {
        var group = app.MapGroup("/api/items")
            .WithTags("Items")
            .WithOpenApi();

        group.MapPost("/", AddItem)
            .WithName("CreateItem")
            .WithSummary("Create a new quiz item")
            .Produces<ItemModel>(201)
            .Produces(400);
    }

    private static async Task<IResult> AddItem(
        [FromBody] AddItemRequest request,
        [FromServices] AddItemsHandler handler)
    {
        return await handler.HandleAsync(request);
    }
}
