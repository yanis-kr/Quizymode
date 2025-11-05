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
        // Retry logic: Wait for database to be available and retry migration
        const int maxRetries = 5;
        const int delayMs = 2000;
        bool migrationSucceeded = false;
        
        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                using IServiceScope scope = _serviceProvider.CreateScope();
                ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                _logger.LogInformation("Attempting to apply database migrations (attempt {Attempt}/{MaxRetries})...", attempt, maxRetries);
                
                // Apply migrations
                await db.Database.MigrateAsync(cancellationToken);
                
                _logger.LogInformation("Database migrations applied successfully.");
                migrationSucceeded = true;
                break; // Success, exit retry loop
            }
            catch (Exception ex) when (attempt < maxRetries)
            {
                _logger.LogWarning(ex, "Migration attempt {Attempt} failed. Retrying in {Delay}ms... Error: {Error}", attempt, delayMs, ex.Message);
                await Task.Delay(delayMs, cancellationToken);
                continue;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "All migration attempts failed. Last error: {Error}", ex.Message);
                throw; // Re-throw on final attempt
            }
        }
        
        if (!migrationSucceeded)
        {
            _logger.LogError("Failed to apply database migrations after {MaxRetries} attempts.", maxRetries);
            return; // Exit early if migrations failed
        }
        
        try
        {
            using IServiceScope scope = _serviceProvider.CreateScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Seed items if empty
            bool hasItems = await db.Items.AnyAsync(cancellationToken);
            if (!hasItems)
            {
                _logger.LogInformation("Seeding initial data from JSON files...");

                string seedPath = Path.Combine(_environment.ContentRootPath, "Data", "Seed");
                
                // Load items from JSON files
                // Files are named like: items-{categoryId}-{subcategoryId}.json
                string[] itemFiles = Directory.GetFiles(seedPath, "items-*.json");

                foreach (string itemsFile in itemFiles)
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
                            _logger.LogInformation("Inserted {Count} items for {CategoryId}/{SubcategoryId}", 
                                itemsToInsert.Count, itemsData.CategoryId, itemsData.SubcategoryId);
                        }
                    }
                }

                _logger.LogInformation("Database seeding completed successfully.");
            }
            else
            {
                _logger.LogInformation("Skipping seeding; items already present.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Database seeding failed. Error: {ErrorMessage}", ex.Message);
            _logger.LogError("Stack trace: {StackTrace}", ex.StackTrace);
            
            // Re-throw in development to make issues visible
            if (System.Diagnostics.Debugger.IsAttached)
            {
                throw;
            }
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

// Seed data models for JSON deserialization
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
