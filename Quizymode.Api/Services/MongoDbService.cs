using MongoDB.Driver;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

public interface IMongoDbService
{
    IMongoCollection<ItemModel> Items { get; }
    IMongoCollection<CollectionModel> Collections { get; }
}

public class MongoDbService : IMongoDbService
{
    private readonly IMongoDatabase _database;

    public MongoDbService(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MongoDB") ?? "mongodb://localhost:27017";
        var client = new MongoClient(connectionString);
        _database = client.GetDatabase("quizymode");
    }

    public IMongoCollection<ItemModel> Items => _database.GetCollection<ItemModel>("items");
    public IMongoCollection<CollectionModel> Collections => _database.GetCollection<CollectionModel>("collections");
}
