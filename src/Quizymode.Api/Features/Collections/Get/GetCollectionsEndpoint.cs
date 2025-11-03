using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Get;

public static class GetCollectionsEndpoint
{
    public static void MapGetCollectionsEndpoint(this WebApplication app)
    {
        var group = app.MapGroup("/api/collections")
            .WithTags("Collections")
            .WithOpenApi();

        group.MapGet("/", GetCollections)
            .WithName("GetCollections")
            .WithSummary("Get all collections")
            .Produces<List<CollectionModel>>(200);
    }

    private static async Task<IResult> GetCollections(
        [FromServices] GetCollectionsHandler handler)
    {
        return await handler.HandleAsync();
    }
}
