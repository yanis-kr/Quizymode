using System.Data;
using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Services;

internal sealed class DatabaseSeederHostedService(
    ILogger<DatabaseSeederHostedService> logger,
    IServiceProvider serviceProvider,
    ISimHashService simHashService,
    IWebHostEnvironment environment,
    IOptions<SeedOptions> seedOptions,
    IOptions<TaxonomyOptions> taxonomyOptions) : IHostedService
{
    private static readonly Guid HomeSampleCollectionId = new("8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511");
    private static readonly HomeSampleTriviaItemSeed[] HomeSampleTriviaItems =
    [
        new(
            "What color is the \"black box\" recorder on most commercial airplanes?",
            "Bright orange",
            ["Black", "Silver", "Yellow"],
            "Flight recorders are painted bright orange so they are easier to locate after an accident.",
            ["aviation", "surprising-facts"]),
        new(
            "What animal's fingerprints are so close to humans that they can confuse crime-scene analysis?",
            "Koalas",
            ["Chimpanzees", "Dogs", "Otters"],
            "Koala fingerprints have ridge patterns so similar to human fingerprints that they have reportedly confused investigators.",
            ["animals", "weird"]),
        new(
            "Which planet has a day longer than its year?",
            "Venus",
            ["Mars", "Mercury", "Neptune"],
            "Venus rotates extremely slowly, so one full spin takes longer than one trip around the Sun.",
            ["space", "planets"]),
        new(
            "What is the national animal of Scotland?",
            "The unicorn",
            ["The stag", "The lion", "The golden eagle"],
            "Scotland's national animal is the unicorn, chosen for its symbolism in Celtic mythology and heraldry.",
            ["countries", "symbols"]),
        new(
            "What everyday food never really spoils when stored properly?",
            "Honey",
            ["Brown rice", "Milk chocolate", "Sea salt crackers"],
            "Honey's low moisture and natural chemistry make it famously long-lasting, and edible ancient honey has even been found in tombs.",
            ["food", "fun-facts"]),
    ];

    private readonly ILogger<DatabaseSeederHostedService> _logger = logger;
    private readonly IServiceProvider _serviceProvider = serviceProvider;
    private readonly ISimHashService _simHashService = simHashService;
    private readonly IWebHostEnvironment _environment = environment;
    private readonly SeedOptions _seedOptions = seedOptions.Value;
    private readonly TaxonomyOptions _taxonomyOptions = taxonomyOptions.Value;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Migrations are applied in Program.cs before the app accepts requests.
        // Apply any pending migrations here so schema is up to date before seeding (idempotent; no-op if already applied).
        try
        {
            using IServiceScope scope = _serviceProvider.CreateScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            ITaxonomyItemCategoryResolver itemCategoryResolver = scope.ServiceProvider.GetRequiredService<ITaxonomyItemCategoryResolver>();
            ITaxonomyRegistry taxonomyRegistry = scope.ServiceProvider.GetRequiredService<ITaxonomyRegistry>();
            IAuditService auditService = scope.ServiceProvider.GetRequiredService<IAuditService>();

            await db.Database.MigrateAsync(cancellationToken);

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

                        string category = items[0].Category.Trim();
                        List<string> SanitizeKeywordList(string itemCategory, List<string>? raw)
                        {
                            if (raw is null)
                                return [];
                            return raw
                                .Select(k => k.Trim())
                                .Where(k => !string.IsNullOrEmpty(k))
                                .Where(k => !string.Equals(k, itemCategory, StringComparison.OrdinalIgnoreCase))
                                .ToList();
                        }

                        string keyword1;
                        string keyword2;
                        BulkItemSeedData head = items[0];
                        if (!string.IsNullOrWhiteSpace(head.NavigationKeyword1) && !string.IsNullOrWhiteSpace(head.NavigationKeyword2))
                        {
                            keyword1 = KeywordHelper.NormalizeKeywordName(head.NavigationKeyword1) ?? head.NavigationKeyword1.Trim();
                            keyword2 = KeywordHelper.NormalizeKeywordName(head.NavigationKeyword2) ?? head.NavigationKeyword2.Trim();
                        }
                        else
                        {
                            List<string> fk = SanitizeKeywordList(category, head.Keywords);
                            keyword1 = fk.Count > 0 ? KeywordHelper.NormalizeKeywordName(fk[0]) ?? fk[0] : "general";
                            keyword2 = fk.Count > 1 ? KeywordHelper.NormalizeKeywordName(fk[1]) ?? fk[1] : "mixed";
                        }

                        List<string> firstExtras = SanitizeKeywordList(category, head.Keywords)
                            .Where(k => !string.Equals(KeywordHelper.NormalizeKeywordName(k) ?? k, keyword1, StringComparison.OrdinalIgnoreCase))
                            .Where(k => !string.Equals(KeywordHelper.NormalizeKeywordName(k) ?? k, keyword2, StringComparison.OrdinalIgnoreCase))
                            .Select(k => KeywordHelper.NormalizeKeywordName(k) ?? k)
                            .ToList();
                        List<AddItemsBulk.KeywordRequest> defaultKeywords = firstExtras
                            .Select(k => new AddItemsBulk.KeywordRequest(k, false))
                            .ToList();

                        List<AddItemsBulk.ItemRequest> itemRequests = items.Select(item =>
                        {
                            List<string>? kw = SanitizeKeywordList(item.Category.Trim(), item.Keywords)
                                .Select(k => KeywordHelper.NormalizeKeywordName(k) ?? k)
                                .Where(k => !string.Equals(k, keyword1, StringComparison.OrdinalIgnoreCase))
                                .Where(k => !string.Equals(k, keyword2, StringComparison.OrdinalIgnoreCase))
                                .ToList();
                            return new AddItemsBulk.ItemRequest(
                                Question: item.Question,
                                CorrectAnswer: item.CorrectAnswer,
                                IncorrectAnswers: item.IncorrectAnswers,
                                Explanation: item.Explanation ?? string.Empty,
                                Keywords: kw.Count > 0 ? kw.Select(k => new AddItemsBulk.KeywordRequest(k, false)).ToList() : null,
                                Source: item.Source
                            );
                        }).ToList();

                        AddItemsBulk.Request bulkRequest = new AddItemsBulk.Request(
                            IsPrivate: false,
                            Category: category,
                            Keyword1: keyword1,
                            Keyword2: keyword2,
                            Keywords: defaultKeywords,
                            Items: itemRequests
                        );

                        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
                            bulkRequest,
                            db,
                            _simHashService,
                            seederUserContext,
                            itemCategoryResolver,
                            taxonomyRegistry,
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

            await EnsureHomeSampleCollectionAsync(
                db,
                itemCategoryResolver,
                taxonomyRegistry,
                auditService,
                cancellationToken);
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
            .Where(c => c.Name.ToLower() == "science")
            .OrderBy(c => c.Id)
            .FirstOrDefaultAsync(cancellationToken);

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

    private async Task EnsureHomeSampleCollectionAsync(
        ApplicationDbContext db,
        ITaxonomyItemCategoryResolver itemCategoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        List<Guid> sampleItemIds = await EnsureHomeSampleTriviaItemsAsync(
            db,
            itemCategoryResolver,
            taxonomyRegistry,
            auditService,
            cancellationToken);
        if (sampleItemIds.Count == 0)
        {
            _logger.LogWarning("No public items available for the homepage sample collection. Skipping collection seed.");
            return;
        }

        const string sampleCollectionName = "Fun Trivia Facts";
        const string sampleCollectionDescription =
            "A public five-item trivia sampler with surprising facts and easy conversation-starter questions.";

        Collection? collection = await db.Collections
            .FirstOrDefaultAsync(c => c.Id == HomeSampleCollectionId, cancellationToken);

        if (collection is null)
        {
            collection = new Collection
            {
                Id = HomeSampleCollectionId,
                Name = sampleCollectionName,
                Description = sampleCollectionDescription,
                CreatedBy = "seeder",
                CreatedAt = DateTime.UtcNow,
                IsPublic = true,
            };
            await db.Collections.AddAsync(collection, cancellationToken);
        }
        else
        {
            collection.Name = sampleCollectionName;
            collection.Description = sampleCollectionDescription;
            collection.IsPublic = true;
            collection.UpdatedAt = DateTime.UtcNow;
        }

        List<CollectionItem> existingLinks = await db.CollectionItems
            .Where(ci => ci.CollectionId == HomeSampleCollectionId)
            .ToListAsync(cancellationToken);

        HashSet<Guid> desiredItemIds = sampleItemIds.ToHashSet();
        List<CollectionItem> linksToRemove = existingLinks
            .Where(link => !desiredItemIds.Contains(link.ItemId))
            .ToList();

        if (linksToRemove.Count > 0)
        {
            db.CollectionItems.RemoveRange(linksToRemove);
        }

        HashSet<Guid> existingItemIds = existingLinks
            .Select(link => link.ItemId)
            .ToHashSet();

        List<CollectionItem> linksToAdd = sampleItemIds
            .Where(itemId => !existingItemIds.Contains(itemId))
            .Select(itemId => new CollectionItem
            {
                CollectionId = HomeSampleCollectionId,
                ItemId = itemId,
                AddedAt = DateTime.UtcNow,
            })
            .ToList();

        if (linksToAdd.Count > 0)
        {
            await db.CollectionItems.AddRangeAsync(linksToAdd, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Ensured homepage sample collection {CollectionId} with {ItemCount} items.",
            HomeSampleCollectionId,
            sampleItemIds.Count);
    }

    private async Task<List<Guid>> EnsureHomeSampleTriviaItemsAsync(
        ApplicationDbContext db,
        ITaxonomyItemCategoryResolver itemCategoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        AddItemsBulk.Request request = new(
            IsPrivate: false,
            Category: "trivia",
            Keyword1: "general",
            Keyword2: "mixed",
            Keywords: [],
            Items: HomeSampleTriviaItems
                .Select(item => new AddItemsBulk.ItemRequest(
                    Question: item.Question,
                    CorrectAnswer: item.CorrectAnswer,
                    IncorrectAnswers: item.IncorrectAnswers,
                    Explanation: item.Explanation,
                    Keywords: item.Keywords
                        .Select(keyword => new AddItemsBulk.KeywordRequest(keyword, false))
                        .ToList(),
                    Source: "seed: home sample collection"))
                .ToList());

        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
            request,
            db,
            _simHashService,
            new SeederUserContext(),
            itemCategoryResolver,
            taxonomyRegistry,
            auditService,
            cancellationToken);

        if (result.IsFailure)
        {
            _logger.LogWarning(
                "Failed to seed homepage trivia items: {Error}",
                result.Error?.Description ?? "Unknown error");
        }

        List<string> questions = HomeSampleTriviaItems
            .Select(item => item.Question)
            .ToList();

        return await db.Items
            .AsNoTracking()
            .Where(i => !i.IsPrivate)
            .Where(i => i.CreatedBy == "seeder")
            .Where(i => i.Category != null && i.Category.Name == "trivia")
            .Where(i => i.NavigationKeyword1 != null && i.NavigationKeyword1.Name == "general")
            .Where(i => i.NavigationKeyword2 != null && i.NavigationKeyword2.Name == "mixed")
            .Where(i => questions.Contains(i.Question))
            .OrderBy(i => i.CreatedAt)
            .Select(i => i.Id)
            .ToListAsync(cancellationToken);
    }

    private async Task SeedCategoriesAndNavigationAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Seeding categories and navigation from generated taxonomy SQL...");

        string sqlPath;
        try
        {
            sqlPath = TaxonomyYamlLoader.ResolveSeedSqlPath(_environment, _taxonomyOptions);
        }
        catch (FileNotFoundException ex)
        {
            _logger.LogError(
                ex,
                "Taxonomy seed SQL not found. Generate it with: dotnet run --project tools/Quizymode.TaxonomySqlGen");
            throw;
        }

        string sql = await File.ReadAllTextAsync(sqlPath, cancellationToken);
        DbConnection conn = db.Database.GetDbConnection();
        bool shouldClose = conn.State != ConnectionState.Open;
        if (shouldClose)
            await db.Database.OpenConnectionAsync(cancellationToken);

        try
        {
            await using DbTransaction tx = await conn.BeginTransactionAsync(cancellationToken);
            await using DbCommand cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = sql;
            await cmd.ExecuteNonQueryAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        finally
        {
            if (shouldClose)
                await db.Database.CloseConnectionAsync();
        }

        _logger.LogInformation("Taxonomy seed SQL applied.");
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

    [JsonPropertyName("navigationKeyword1")]
    public string? NavigationKeyword1 { get; set; }

    [JsonPropertyName("navigationKeyword2")]
    public string? NavigationKeyword2 { get; set; }
}

// Seeder user context for bulk add operations
internal sealed class SeederUserContext : IUserContext
{
    public bool IsAuthenticated => true;
    public string? UserId => "seeder";
    public bool IsAdmin => true;
}

internal sealed record HomeSampleTriviaItemSeed(
    string Question,
    string CorrectAnswer,
    List<string> IncorrectAnswers,
    string Explanation,
    List<string> Keywords);
