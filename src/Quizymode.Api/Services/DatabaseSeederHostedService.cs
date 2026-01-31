using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Shared.Kernel;
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

            // Seed categories and navigation keywords (always run, idempotent)
            await SeedCategoriesAndNavigationAsync(db, cancellationToken);

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

                // Load all JSON files from the minimal directory only
                string[] allFiles = Directory.GetFiles(resolvedSeedPath, "*.json");

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
                            Question: item.Question,
                            CorrectAnswer: item.CorrectAnswer,
                            IncorrectAnswers: item.IncorrectAnswers,
                            Explanation: item.Explanation ?? string.Empty,
                            Keywords: item.Keywords?.Select(k => new AddItemsBulk.KeywordRequest(k, false)).ToList(),
                            Source: item.Source
                        )).ToList();

                        AddItemsBulk.Request bulkRequest = new AddItemsBulk.Request(
                            IsPrivate: false, // Seed items are global
                            Items: itemRequests
                        );

                        // Get CategoryResolver and AuditService from scope
                        ICategoryResolver categoryResolver = scope.ServiceProvider.GetRequiredService<ICategoryResolver>();
                        IAuditService auditService = scope.ServiceProvider.GetRequiredService<IAuditService>();

                        // Use bulk add handler
                        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
                            bulkRequest,
                            db,
                            _simHashService,
                            seederUserContext,
                            categoryResolver,
                            auditService,
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

                // Add rating 5 for items with Category=Science
                await SeedScienceRatingsAsync(db, cancellationToken);

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

    private async Task SeedScienceRatingsAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        // Find the Science category
        Category? scienceCategory = await db.Categories
            .FirstOrDefaultAsync(c => c.Name == "Science", cancellationToken);

        if (scienceCategory is null)
        {
            _logger.LogInformation("Science category not found. Skipping rating seeding.");
            return; // No Science category found, skip rating seeding
        }

        // Get all items with Science category
        List<Item> scienceItems = await db.Items
            .Where(i => i.CategoryId == scienceCategory.Id)
            .ToListAsync(cancellationToken);

        if (scienceItems.Count == 0)
        {
            _logger.LogInformation("No Science items found. Skipping rating seeding.");
            return; // No Science items found
        }

        // Add rating 5 for each Science item
        List<Rating> ratings = scienceItems.Select(item => new Rating
        {
            ItemId = item.Id,
            Stars = 5,
            CreatedBy = "seeder",
            CreatedAt = DateTime.UtcNow
        }).ToList();

        await db.Ratings.AddRangeAsync(ratings, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        
        _logger.LogInformation("Added {Count} ratings (5 stars) for Science category items.", ratings.Count);
    }

    private async Task SeedCategoriesAndNavigationAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Seeding categories and navigation keywords...");

        // Fixed categories
        List<string> categoryNames = new()
        {
            "general", "history", "science", "geography", "entertainment",
            "culture", "language", "puzzles", "sports", "tests", "certs",
            "outdoors", "nature"
        };

        // Seed categories (if missing)
        Dictionary<string, Category> categories = new();
        foreach (string categoryName in categoryNames)
        {
            Category? existingCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.Name.ToLower() == categoryName.ToLower(), cancellationToken);

            if (existingCategory is null)
            {
                Category newCategory = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = categoryName,
                    IsPrivate = false,
                    CreatedBy = "seeder",
                    CreatedAt = DateTime.UtcNow
                };
                db.Categories.Add(newCategory);
                await db.SaveChangesAsync(cancellationToken);
                categories[categoryName] = newCategory;
                _logger.LogInformation("Created category: {CategoryName}", categoryName);
            }
            else
            {
                categories[categoryName] = existingCategory;
            }
        }

        // Seed "other" keyword for each category (if missing)
        foreach ((string categoryName, Category category) in categories)
        {
            await SeedOtherKeywordAsync(db, category, cancellationToken);
        }

        // Seed rank-1 keywords per category
        Dictionary<string, List<string>> rank1Keywords = new()
        {
            { "general", new List<string> { "world-records", "trivia", "fun-facts", "daily", "mixed", "random" } },
            { "history", new List<string> { "us-history", "world-history", "ancient", "modern", "biography" } },
            { "science", new List<string> { "biology", "astronomy", "physics", "chemistry", "earth-science" } },
            { "geography", new List<string> { "countries", "capitals", "us-states", "flags", "maps" } },
            { "entertainment", new List<string> { "movies", "tv", "music", "quotes", "pop-culture" } },
            { "culture", new List<string> { "food", "holidays", "traditions", "customs", "slang" } },
            { "language", new List<string> { "spanish", "french", "english", "vocabulary", "idioms" } },
            { "puzzles", new List<string> { "riddles", "logic", "brain-teasers", "math-puzzles", "patterns" } },
            { "sports", new List<string> { "soccer", "basketball", "tennis", "olympics", "athletes" } },
            { "tests", new List<string> { "act", "sat", "gmat", "gre", "nclex" } },
            { "certs", new List<string> { "aws", "azure", "gcp", "comptia", "kubernetes" } },
            { "outdoors", new List<string> { "survival", "camping", "navigation" } },
            { "nature", new List<string> { "animals", "plants", "ecosystems", "phenomena" } }
        };

        foreach ((string categoryName, List<string> keywords) in rank1Keywords)
        {
            if (categories.TryGetValue(categoryName, out Category? category))
            {
                for (int i = 0; i < keywords.Count; i++)
                {
                    await SeedNavigationKeywordAsync(
                        db,
                        category,
                        keywords[i],
                        navigationRank: 1,
                        parentName: null,
                        sortRank: i + 1, // Start at 1 (0 is reserved for "other")
                        cancellationToken);
                }
            }
        }

        // Seed rank-2 keywords
        Dictionary<(string Category, string Parent), List<string>> rank2Keywords = new()
        {
            { ("general", "world-records"), new List<string> { "humans", "animals", "weird" } },
            { ("certs", "aws"), new List<string> { "saa-c02", "saa-c03", "dva-c02", "soa-c02" } },
            { ("tests", "act"), new List<string> { "math", "reading", "english", "science" } },
            { ("tests", "sat"), new List<string> { "math", "reading", "writing" } },
            { ("tests", "nclex"), new List<string> { "med-surg", "pediatrics", "pharm", "dosage-calc" } }
        };

        foreach (((string categoryName, string parentName), List<string> keywords) in rank2Keywords)
        {
            if (categories.TryGetValue(categoryName, out Category? category))
            {
                for (int i = 0; i < keywords.Count; i++)
                {
                    await SeedNavigationKeywordAsync(
                        db,
                        category,
                        keywords[i],
                        navigationRank: 2,
                        parentName: parentName,
                        sortRank: i,
                        cancellationToken);
                }
            }
        }

        _logger.LogInformation("Categories and navigation keywords seeding completed.");
    }

    private async Task SeedOtherKeywordAsync(
        ApplicationDbContext db,
        Category category,
        CancellationToken cancellationToken)
    {
        // Find or create "other" keyword (global) first
        Keyword? otherKeyword = await db.Keywords
            .FirstOrDefaultAsync(k => k.Name.ToLower() == "other" && !k.IsPrivate, cancellationToken);

        if (otherKeyword is null)
        {
            otherKeyword = new Keyword
            {
                Id = Guid.NewGuid(),
                Name = "other",
                IsPrivate = false,
                CreatedBy = "seeder",
                CreatedAt = DateTime.UtcNow
            };
            db.Keywords.Add(otherKeyword);
            await db.SaveChangesAsync(cancellationToken);
        }

        // Check if CategoryKeyword already exists for this category and keyword combination
        // This checks the unique constraint: CategoryId + KeywordId
        bool otherExists = await db.CategoryKeywords
            .AnyAsync(ck => ck.CategoryId == category.Id && ck.KeywordId == otherKeyword.Id, cancellationToken);

        if (otherExists)
        {
            return; // Already exists
        }

        // Create CategoryKeyword entry for "other"
        CategoryKeyword categoryKeyword = new CategoryKeyword
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            KeywordId = otherKeyword.Id,
            NavigationRank = 1,
            ParentName = null,
            SortRank = 0,
            CreatedAt = DateTime.UtcNow
        };
        db.CategoryKeywords.Add(categoryKeyword);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedNavigationKeywordAsync(
        ApplicationDbContext db,
        Category category,
        string keywordName,
        int navigationRank,
        string? parentName,
        int sortRank,
        CancellationToken cancellationToken)
    {
        // Find or create keyword (global) first
        Keyword? keyword = await db.Keywords
            .FirstOrDefaultAsync(k => k.Name.ToLower() == keywordName.ToLower() && !k.IsPrivate, cancellationToken);

        if (keyword is null)
        {
            keyword = new Keyword
            {
                Id = Guid.NewGuid(),
                Name = keywordName.ToLowerInvariant(), // Store normalized
                IsPrivate = false,
                CreatedBy = "seeder",
                CreatedAt = DateTime.UtcNow
            };
            db.Keywords.Add(keyword);
            await db.SaveChangesAsync(cancellationToken);
        }

        // Check if CategoryKeyword already exists for this category and keyword combination
        // This checks the unique constraint: CategoryId + KeywordId
        bool exists = await db.CategoryKeywords
            .AnyAsync(ck => ck.CategoryId == category.Id && ck.KeywordId == keyword.Id, cancellationToken);

        if (exists)
        {
            return; // Already exists
        }

        // Create CategoryKeyword entry
        CategoryKeyword categoryKeyword = new CategoryKeyword
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            KeywordId = keyword.Id,
            NavigationRank = navigationRank,
            ParentName = parentName?.ToLowerInvariant(), // Store normalized
            SortRank = sortRank,
            CreatedAt = DateTime.UtcNow
        };
        db.CategoryKeywords.Add(categoryKeyword);
        await db.SaveChangesAsync(cancellationToken);
    }
}

// Seed data model for JSON deserialization (bulk format)
internal sealed class BulkItemSeedData
{
    public string Category { get; set; } = string.Empty;
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = new();
    public string? Explanation { get; set; }
    public List<string>? Keywords { get; set; }
    public string? Source { get; set; }
}

// Seeder user context for bulk add operations
internal sealed class SeederUserContext : IUserContext
{
    public bool IsAuthenticated => true;
    public string? UserId => "seeder";
    public bool IsAdmin => true;
}
