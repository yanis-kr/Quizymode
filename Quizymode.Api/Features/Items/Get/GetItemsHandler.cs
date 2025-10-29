using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

public class GetItemsHandler
{
    private readonly MongoDbContext _db;

    public GetItemsHandler(MongoDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> HandleAsync(string? categoryId, string? subcategoryId, int page, int pageSize)
    {
        var filter = Builders<ItemModel>.Filter.Empty;

        if (!string.IsNullOrEmpty(categoryId))
            filter &= Builders<ItemModel>.Filter.Eq(i => i.CategoryId, categoryId);

        if (!string.IsNullOrEmpty(subcategoryId))
            filter &= Builders<ItemModel>.Filter.Eq(i => i.SubcategoryId, subcategoryId);

        var totalCount = await _db.Items.CountDocumentsAsync(filter);
        var items = await _db.Items
            .Find(filter)
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync();

        var result = new PaginatedResult<ItemModel>(
            items,
            (int)totalCount,
            page,
            pageSize,
            (int)Math.Ceiling((double)totalCount / pageSize));

        return Results.Ok(result);
    }
}
