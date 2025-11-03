using System.Text.Json;
using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

public class DatabaseSeederHostedService : IHostedService
{
    private readonly ILogger<DatabaseSeederHostedService> _logger;
    private readonly MongoDbContext _db;
    private readonly ISimHashService _simHashService;
    private readonly IWebHostEnvironment _environment;

    public DatabaseSeederHostedService(
        ILogger<DatabaseSeederHostedService> logger,
        MongoDbContext db,
        ISimHashService simHashService,
        IWebHostEnvironment environment)
    {
        _logger = logger;
        _db = db;
        _simHashService = simHashService;
        _environment = environment;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            // Seed Collections if empty
            var collectionsCount = await _db.Collections.CountDocumentsAsync(FilterDefinition<CollectionModel>.Empty, cancellationToken: cancellationToken);
            if (collectionsCount == 0)
            {
                _logger.LogInformation("Seeding initial data from JSON files...");

                var seedPath = Path.Combine(_environment.ContentRootPath, "Data", "Seed");
                
                // Load collections
                var collectionsFile = Path.Combine(seedPath, "collections.json");
                if (File.Exists(collectionsFile))
                {
                    var collectionsJson = await File.ReadAllTextAsync(collectionsFile, cancellationToken);
                    var collectionData = JsonSerializer.Deserialize<List<CollectionSeedData>>(collectionsJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    if (collectionData != null)
                    {
                        foreach (var colData in collectionData)
                        {
                            var collection = new CollectionModel
                            {
                                Name = colData.Name,
                                Description = colData.Description,
                                CategoryId = colData.CategoryId,
                                SubcategoryId = colData.SubcategoryId,
                                Visibility = colData.Visibility,
                                CreatedBy = "seeder",
                                CreatedAt = DateTime.UtcNow,
                                ItemCount = 0
                            };

                            await _db.Collections.InsertOneAsync(collection, cancellationToken: cancellationToken);
                            _logger.LogInformation("Inserted collection: {Name} ({CategoryId}/{SubcategoryId})", collection.Name, collection.CategoryId, collection.SubcategoryId);

                            // Load items for this collection
                            var itemsFile = Path.Combine(seedPath, $"items-{colData.CategoryId}-{colData.SubcategoryId}.json");
                            if (File.Exists(itemsFile))
                            {
                                var itemsJson = await File.ReadAllTextAsync(itemsFile, cancellationToken);
                                var itemsData = JsonSerializer.Deserialize<ItemsSeedData>(itemsJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                                if (itemsData?.Items != null && itemsData.Items.Any())
                                {
                                    var itemsToInsert = new List<ItemModel>();
                                    foreach (var itemData in itemsData.Items)
                                    {
                                        // Compute SimHash for duplicate detection
                                        var questionText = $"{itemData.Question} {itemData.CorrectAnswer} {string.Join(" ", itemData.IncorrectAnswers)}";
                                        var fuzzySignature = _simHashService.ComputeSimHash(questionText);
                                        var fuzzyBucket = _simHashService.GetFuzzyBucket(fuzzySignature);

                                        var item = new ItemModel
                                        {
                                            CategoryId = itemsData.CategoryId,
                                            SubcategoryId = itemsData.SubcategoryId,
                                            Visibility = itemsData.Visibility,
                                            Question = itemData.Question,
                                            CorrectAnswer = itemData.CorrectAnswer,
                                            IncorrectAnswers = itemData.IncorrectAnswers,
                                            Explanation = itemData.Explanation,
                                            FuzzySignature = fuzzySignature,
                                            FuzzyBucket = fuzzyBucket,
                                            CreatedBy = "seeder",
                                            CreatedAt = DateTime.UtcNow
                                        };

                                        itemsToInsert.Add(item);
                                    }

                                    if (itemsToInsert.Any())
                                    {
                                        await _db.Items.InsertManyAsync(itemsToInsert, cancellationToken: cancellationToken);
                                        _logger.LogInformation("Inserted {Count} items for collection {Name}", itemsToInsert.Count, collection.Name);

                                        // Update item count
                                        var update = Builders<CollectionModel>.Update.Set(c => c.ItemCount, itemsToInsert.Count);
                                        await _db.Collections.UpdateOneAsync(c => c.Id == collection.Id, update, cancellationToken: cancellationToken);
                                    }
                                }
                            }
                        }

                        _logger.LogInformation("Database seeding completed successfully.");
                    }
                }
                else
                {
                    _logger.LogWarning("Seed file not found: {Path}", collectionsFile);
                }
            }
            else
            {
                _logger.LogInformation("Skipping seeding; collections already present (count: {Count}).", collectionsCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Database seeding failed or MongoDB not available yet.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

// Seed data models for JSON deserialization
internal class CollectionSeedData
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
    public string SubcategoryId { get; set; } = string.Empty;
    public string Visibility { get; set; } = "global";
}

internal class ItemsSeedData
{
    public string CategoryId { get; set; } = string.Empty;
    public string SubcategoryId { get; set; } = string.Empty;
    public string Visibility { get; set; } = "global";
    public List<ItemSeedData> Items { get; set; } = new();
}

internal class ItemSeedData
{
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = new();
    public string Explanation { get; set; } = string.Empty;
}


