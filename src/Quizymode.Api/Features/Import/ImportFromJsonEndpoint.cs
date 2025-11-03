using Microsoft.AspNetCore.Mvc;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Import;

public static class ImportFromJsonEndpoint
{
	public static void MapImportFromJsonEndpoint(this WebApplication app)
	{
		var group = app.MapGroup("/api/import")
			.WithTags("Import")
			.WithOpenApi();

		group.MapPost("/json", ImportFromJson)
			.WithName("ImportFromJson")
			.WithSummary("Import quiz items from JSON format");
	}

	private static async Task<IResult> ImportFromJson(
		[FromBody] JsonImportRequest request,
		[FromServices] ImportFromJsonHandler handler)
	{
		return await handler.HandleAsync(request);
	}
}


