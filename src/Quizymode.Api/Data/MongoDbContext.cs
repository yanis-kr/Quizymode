using MongoDB.Driver;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data;

public class MongoDbContext
{
    private readonly IMongoDatabase _database;

    public MongoDbContext(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MongoDB") ?? "mongodb://localhost:27017";

        var mongoUrl = new MongoUrl(connectionString);
        var settings = MongoClientSettings.FromUrl(mongoUrl);

        // Fail fast if MongoDB is unreachable instead of hanging for a long time
        settings.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
        settings.ConnectTimeout = TimeSpan.FromSeconds(5);
        settings.SocketTimeout = TimeSpan.FromSeconds(5);

        var client = new MongoClient(settings);
        _database = client.GetDatabase("quizymode");
    }

    public IMongoCollection<CollectionModel> Collections => _database.GetCollection<CollectionModel>("collections");
    public IMongoCollection<ItemModel> Items => _database.GetCollection<ItemModel>("items");
}
