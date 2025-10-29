using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Add;

public static class AddCollectionsEndpoint
{
    public static void MapAddCollectionsEndpoint(this WebApplication app)
    {
        var group = app.MapGroup("/api/collections")
            .WithTags("Collections")
            .WithOpenApi();

        group.MapPost("/", AddCollection)
            .WithName("CreateCollection")
            .WithSummary("Create a new collection")
            .Produces<CollectionModel>(201)
            .Produces(400);
    }

    private static async Task<IResult> AddCollection(
        [FromBody] AddCollectionRequest request,
        [FromServices] AddCollectionsHandler handler)
    {
        return await handler.HandleAsync(request);
    }
}
