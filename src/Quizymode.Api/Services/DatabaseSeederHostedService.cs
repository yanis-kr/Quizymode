using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Services;

internal sealed class DatabaseSeederHostedService(
    ILogger<DatabaseSeederHostedService> logger,
    IServiceProvider serviceProvider,
    ISimHashService simHashService,
    IWebHostEnvironment environment,
    IOptions<SeedOptions> seedOptions) : IHostedService
{
    private readonly ILogger<DatabaseSeederHostedService> _logger = logger;
    private readonly IServiceProvider _serviceProvider = serviceProvider;
    private readonly ISimHashService _simHashService = simHashService;
    private readonly IWebHostEnvironment _environment = environment;
    private readonly SeedOptions _seedOptions = seedOptions.Value;

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
                
                // Check if we can connect to the database
                bool canConnect = await db.Database.CanConnectAsync(cancellationToken);
                _logger.LogInformation("Database connection check: {CanConnect}", canConnect);
                
                // Apply migrations (MigrateAsync should create the database and __EFMigrationsHistory table if needed)
                await db.Database.MigrateAsync(cancellationToken);
                
                _logger.LogInformation("Database migrations applied successfully.");
                migrationSucceeded = true;
                break; // Success, exit retry loop
            }
            catch (Exception ex) when (attempt < maxRetries)
            {
                string fullError = GetFullExceptionMessage(ex);
                _logger.LogWarning(ex, "Migration attempt {Attempt} failed. Retrying in {Delay}ms... Error: {Error}", attempt, delayMs, fullError);
                await Task.Delay(delayMs, cancellationToken);
                continue;
            }
            catch (Exception ex)
            {
                string fullError = GetFullExceptionMessage(ex);
                _logger.LogError(ex, "All migration attempts failed. Last error: {Error}", fullError);
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

                if (string.IsNullOrWhiteSpace(_seedOptions.Path))
                {
                    _logger.LogWarning("Seed path is not configured. Skipping database seeding.");
                    return;
                }

                string? resolvedSeedPath = ResolveSeedPath(_seedOptions.Path);
                if (resolvedSeedPath is null)
                {
                    _logger.LogWarning("Seed path {SeedPath} does not exist. Skipping database seeding.", _seedOptions.Path);
                    return;
                }
                
                _logger.LogInformation("Using seed path {SeedPath}", resolvedSeedPath);

                // Load items from JSON files
                // Files are named like: items-{categoryId}-{subcategoryId}.json
                string[] itemFiles = Directory.GetFiles(resolvedSeedPath, "items-*.json");

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
                                Category = itemsData.Category,
                                Subcategory = itemsData.Subcategory,
                                IsPrivate = itemsData.IsPrivate,
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
                            _logger.LogInformation("Inserted {Count} items for {Category}/{Subcategory}", 
                                itemsToInsert.Count, itemsData.Category, itemsData.Subcategory);
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

    private static string GetFullExceptionMessage(Exception ex)
    {
        if (ex.InnerException is null)
        {
            return ex.Message;
        }

        return $"{ex.Message} -> {GetFullExceptionMessage(ex.InnerException)}";
    }

    private string? ResolveSeedPath(string configuredSeedPath)
    {
        if (string.IsNullOrWhiteSpace(configuredSeedPath))
        {
            return null;
        }

        if (Path.IsPathRooted(configuredSeedPath))
        {
            return Directory.Exists(configuredSeedPath) ? configuredSeedPath : null;
        }

        string candidatePath = Path.GetFullPath(Path.Combine(_environment.ContentRootPath, configuredSeedPath));
        if (Directory.Exists(candidatePath))
        {
            return candidatePath;
        }

        DirectoryInfo? current = Directory.GetParent(_environment.ContentRootPath);
        while (current is not null)
        {
            candidatePath = Path.GetFullPath(Path.Combine(current.FullName, configuredSeedPath));
            if (Directory.Exists(candidatePath))
            {
                return candidatePath;
            }

            current = current.Parent;
        }

        return null;
    }
}

// Seed data models for JSON deserialization
internal sealed class ItemsSeedData
{
    public string Category { get; set; } = string.Empty;
    public string Subcategory { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public List<ItemSeedData> Items { get; set; } = new();
}

internal sealed class ItemSeedData
{
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = new();
    public string Explanation { get; set; } = string.Empty;
}
