using Microsoft.AspNetCore.Mvc;

namespace Quizymode.Api.Features.Items.Delete;

public static class DeleteItemsEndpoint
{
    public static void MapDeleteItemsEndpoint(this WebApplication app)
    {
        var group = app.MapGroup("/api/items")
            .WithTags("Items")
            .WithOpenApi();

        group.MapDelete("/{id}", DeleteItem)
            .WithName("DeleteItem")
            .WithSummary("Delete a quiz item")
            .Produces(204)
            .Produces(404);
    }

    private static async Task<IResult> DeleteItem(
        string id,
        [FromServices] DeleteItemsHandler handler)
    {
        return await handler.HandleAsync(id);
    }
}
