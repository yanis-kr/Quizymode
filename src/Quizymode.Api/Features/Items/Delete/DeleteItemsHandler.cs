using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Delete;

public class DeleteItemsHandler
{
    private readonly MongoDbContext _db;

    public DeleteItemsHandler(MongoDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> HandleAsync(string id)
    {
        var result = await _db.Items.DeleteOneAsync(Builders<ItemModel>.Filter.Eq(i => i.Id, id));
        
        if (result.DeletedCount == 0)
            return Results.NotFound();

        return Results.NoContent();
    }
}
