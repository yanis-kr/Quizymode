using Microsoft.AspNetCore.Mvc;

namespace Quizymode.Api.Features.Collections.Get;

public static class GetCollectionItemsEndpoint
{
	public static void MapGetCollectionItemsEndpoint(this WebApplication app)
	{
		var group = app.MapGroup("/api/collections")
			.WithTags("Collections")
			.WithOpenApi();

		group.MapGet("/{id}/items", GetCollectionItems)
			.WithName("GetCollectionItems")
			.WithSummary("Get items in a collection");
	}

	private static async Task<IResult> GetCollectionItems(
		string id,
		[FromServices] GetCollectionItemsHandler handler)
	{
		return await handler.HandleAsync(id);
	}
}


