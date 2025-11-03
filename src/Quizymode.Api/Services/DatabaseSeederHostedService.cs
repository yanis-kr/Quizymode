using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

public sealed class DatabaseSeederHostedService : IHostedService
{
    private readonly ILogger<DatabaseSeederHostedService> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly ISimHashService _simHashService;
    private readonly IWebHostEnvironment _environment;

    public DatabaseSeederHostedService(
        ILogger<DatabaseSeederHostedService> logger,
        IServiceProvider serviceProvider,
        ISimHashService simHashService,
        IWebHostEnvironment environment)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
        _simHashService = simHashService;
        _environment = environment;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using IServiceScope scope = _serviceProvider.CreateScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Apply migrations
            await db.Database.MigrateAsync(cancellationToken);

            // Seed Collections if empty
            bool hasCollections = await db.Collections.AnyAsync(cancellationToken);
            if (!hasCollections)
            {
                _logger.LogInformation("Seeding initial data from JSON files...");

                string seedPath = Path.Combine(_environment.ContentRootPath, "Data", "Seed");
                
                // Load collections
                string collectionsFile = Path.Combine(seedPath, "collections.json");
                if (File.Exists(collectionsFile))
                {
                    string collectionsJson = await File.ReadAllTextAsync(collectionsFile, cancellationToken);
                    List<CollectionSeedData>? collectionData = JsonSerializer.Deserialize<List<CollectionSeedData>>(
                        collectionsJson, 
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    if (collectionData is not null)
                    {
                        foreach (CollectionSeedData colData in collectionData)
                        {
                            Collection collection = new Collection
                            {
                                Id = Guid.NewGuid(),
                                Name = colData.Name,
                                Description = colData.Description,
                                CategoryId = colData.CategoryId,
                                SubcategoryId = colData.SubcategoryId,
                                Visibility = colData.Visibility,
                                CreatedBy = "seeder",
                                CreatedAt = DateTime.UtcNow,
                                ItemCount = 0
                            };

                            db.Collections.Add(collection);
                            await db.SaveChangesAsync(cancellationToken);
                            _logger.LogInformation("Inserted collection: {Name} ({CategoryId}/{SubcategoryId})", 
                                collection.Name, collection.CategoryId, collection.SubcategoryId);

                            // Load items for this collection
                            string itemsFile = Path.Combine(seedPath, $"items-{colData.CategoryId}-{colData.SubcategoryId}.json");
                            if (File.Exists(itemsFile))
                            {
                                string itemsJson = await File.ReadAllTextAsync(itemsFile, cancellationToken);
                                ItemsSeedData? itemsData = JsonSerializer.Deserialize<ItemsSeedData>(
                                    itemsJson, 
                                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                                if (itemsData?.Items is not null && itemsData.Items.Any())
                                {
                                    List<Item> itemsToInsert = new();
                                    foreach (ItemSeedData itemData in itemsData.Items)
                                    {
                                        // Compute SimHash for duplicate detection
                                        string questionText = $"{itemData.Question} {itemData.CorrectAnswer} {string.Join(" ", itemData.IncorrectAnswers)}";
                                        string fuzzySignature = _simHashService.ComputeSimHash(questionText);
                                        int fuzzyBucket = _simHashService.GetFuzzyBucket(fuzzySignature);

                                        Item item = new Item
                                        {
                                            Id = Guid.NewGuid(),
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
                                        db.Items.AddRange(itemsToInsert);
                                        await db.SaveChangesAsync(cancellationToken);
                                        _logger.LogInformation("Inserted {Count} items for collection {Name}", 
                                            itemsToInsert.Count, collection.Name);

                                        // Update item count
                                        collection.ItemCount = itemsToInsert.Count;
                                        await db.SaveChangesAsync(cancellationToken);
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
                _logger.LogInformation("Skipping seeding; collections already present.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Database seeding failed or PostgreSQL not available yet.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

// Seed data models for JSON deserialization
internal sealed class CollectionSeedData
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
    public string SubcategoryId { get; set; } = string.Empty;
    public string Visibility { get; set; } = "global";
}

internal sealed class ItemsSeedData
{
    public string CategoryId { get; set; } = string.Empty;
    public string SubcategoryId { get; set; } = string.Empty;
    public string Visibility { get; set; } = "global";
    public List<ItemSeedData> Items { get; set; } = new();
}

internal sealed class ItemSeedData
{
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = new();
    public string Explanation { get; set; } = string.Empty;
}
