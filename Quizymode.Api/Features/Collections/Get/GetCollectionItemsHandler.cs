using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Get;

public class GetCollectionItemsHandler
{
	private readonly MongoDbContext _db;

	public GetCollectionItemsHandler(MongoDbContext db)
	{
		_db = db;
	}

	public async Task<IResult> HandleAsync(string collectionId)
	{
		var collection = await _db.Collections
			.Find(c => c.Id == collectionId)
			.FirstOrDefaultAsync();

		if (collection == null)
			return Results.NotFound();

		var items = await _db.Items
			.Find(i => i.CategoryId == collection.CategoryId && i.SubcategoryId == collection.SubcategoryId)
			.ToListAsync();

		return Results.Ok(items);
	}
}


