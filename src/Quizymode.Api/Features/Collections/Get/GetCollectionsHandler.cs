using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Get;

public class GetCollectionsHandler
{
    private readonly MongoDbContext _db;

    public GetCollectionsHandler(MongoDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> HandleAsync()
    {
        var collections = await _db.Collections
            .Find(_ => true)
            .ToListAsync();

        return Results.Ok(collections);
    }
}
