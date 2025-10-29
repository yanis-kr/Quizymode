using MongoDB.Driver;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data;

public class MongoDbContext
{
    private readonly IMongoDatabase _database;

    public MongoDbContext(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MongoDB") ?? "mongodb://localhost:27017";
        var client = new MongoClient(connectionString);
        _database = client.GetDatabase("quizymode");
    }

    public IMongoCollection<CollectionModel> Collections => _database.GetCollection<CollectionModel>("collections");
    public IMongoCollection<ItemModel> Items => _database.GetCollection<ItemModel>("items");
}
