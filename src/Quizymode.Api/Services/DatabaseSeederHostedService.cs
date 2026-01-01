using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Shared.Kernel;
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

                // Create a seeder user context (admin privileges)
                SeederUserContext seederUserContext = new SeederUserContext();

                // Load all JSON files (both bulk-*.json and items-*.json)
                string[] bulkFiles = Directory.GetFiles(resolvedSeedPath, "bulk-*.json");
                string[] itemFiles = Directory.GetFiles(resolvedSeedPath, "items-*.json");
                string[] allFiles = bulkFiles.Concat(itemFiles).ToArray();

                int totalItemsProcessed = 0;
                int totalItemsCreated = 0;

                foreach (string jsonFile in allFiles)
                {
                    try
                    {
                        string fileJson = await File.ReadAllTextAsync(jsonFile, cancellationToken);
                        
                        // Deserialize as array of items (bulk format)
                        List<BulkItemSeedData>? items = JsonSerializer.Deserialize<List<BulkItemSeedData>>(
                            fileJson,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                        if (items is null || items.Count == 0)
                        {
                            _logger.LogWarning("No items found in {FileName}", Path.GetFileName(jsonFile));
                            continue;
                        }

                        // Convert to AddItemsBulk.Request format
                        List<AddItemsBulk.ItemRequest> itemRequests = items.Select(item => new AddItemsBulk.ItemRequest(
                            Category: item.Category,
                            Subcategory: item.Subcategory,
                            Question: item.Question,
                            CorrectAnswer: item.CorrectAnswer,
                            IncorrectAnswers: item.IncorrectAnswers,
                            Explanation: item.Explanation ?? string.Empty,
                            Keywords: item.Keywords?.Select(k => new AddItemsBulk.KeywordRequest(k, false)).ToList()
                        )).ToList();

                        AddItemsBulk.Request bulkRequest = new AddItemsBulk.Request(
                            IsPrivate: false, // Seed items are global
                            Items: itemRequests
                        );

                        // Use bulk add handler
                        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
                            bulkRequest,
                            db,
                            _simHashService,
                            seederUserContext,
                            cancellationToken);

                        if (result.IsSuccess && result.Value is not null)
                        {
                            totalItemsProcessed += result.Value.TotalRequested;
                            totalItemsCreated += result.Value.CreatedCount;
                            
                            _logger.LogInformation(
                                "Processed {FileName}: {Created} created, {Duplicates} duplicates, {Failed} failed",
                                Path.GetFileName(jsonFile),
                                result.Value.CreatedCount,
                                result.Value.DuplicateCount,
                                result.Value.FailedCount);
                            
                            if (result.Value.Errors.Count > 0)
                            {
                                foreach (AddItemsBulk.ItemError error in result.Value.Errors)
                                {
                                    _logger.LogWarning("Error in {FileName} item {Index}: {Error}",
                                        Path.GetFileName(jsonFile),
                                        error.Index,
                                        error.ErrorMessage);
                                }
                            }
                        }
                        else
                        {
                            _logger.LogError("Failed to process {FileName}: {Error}",
                                Path.GetFileName(jsonFile),
                                result.Error?.Description ?? "Unknown error");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing {FileName}: {Error}",
                            Path.GetFileName(jsonFile),
                            ex.Message);
                    }
                }

                _logger.LogInformation("Seeding completed: {TotalProcessed} items processed, {TotalCreated} items created",
                    totalItemsProcessed,
                    totalItemsCreated);

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

// Seed data model for JSON deserialization (bulk format)
internal sealed class BulkItemSeedData
{
    public string Category { get; set; } = string.Empty;
    public string Subcategory { get; set; } = string.Empty;
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = new();
    public string? Explanation { get; set; }
    public List<string>? Keywords { get; set; }
}

// Seeder user context for bulk add operations
internal sealed class SeederUserContext : IUserContext
{
    public bool IsAuthenticated => true;
    public string? UserId => "seeder";
    public bool IsAdmin => true;
}
