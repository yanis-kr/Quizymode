using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Add;

public class AddCollectionsHandler
{
    private readonly MongoDbContext _db;

    public AddCollectionsHandler(MongoDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> HandleAsync(AddCollectionRequest request)
    {
        var collection = new CollectionModel
        {
            Name = request.Name,
            Description = request.Description,
            CategoryId = request.CategoryId,
            SubcategoryId = request.SubcategoryId,
            Visibility = request.Visibility,
            CreatedBy = "dev_user", // TODO: Get from auth context
            CreatedAt = DateTime.UtcNow
        };

        await _db.Collections.InsertOneAsync(collection);
        return Results.Created($"/api/collections/{collection.Id}", collection);
    }
}
