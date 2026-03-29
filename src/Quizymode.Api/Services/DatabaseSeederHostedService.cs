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
    private const string SeedItemsFolderName = "items";
    private const string SampleCollectionsFolderName = "sample-collections";
    private const string HomeSampleCollectionFileName = "home-sample.json";

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

            string? resolvedSeedRoot = null;
            if (!string.IsNullOrWhiteSpace(_seedOptions.Path))
            {
                resolvedSeedRoot = ResolveSeedPath(_seedOptions.Path);
            }

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

                if (resolvedSeedRoot is null)
                {
                    _logger.LogWarning("Seed path {SeedPath} does not exist. Skipping database seeding.", _seedOptions.Path);
                    return;
                }

                string? resolvedItemsPath = ResolveSeedItemsPath(resolvedSeedRoot);
                if (resolvedItemsPath is null)
                {
                    _logger.LogWarning("Seed items path does not exist under {SeedPath}. Skipping database seeding.", resolvedSeedRoot);
                    return;
                }

                _logger.LogInformation("Using seed items path {SeedItemsPath}", resolvedItemsPath);

                // Create a seeder user context (admin privileges)
                SeederUserContext seederUserContext = new SeederUserContext();

                string[] allFiles = Directory.GetFiles(resolvedItemsPath, "*.json", SearchOption.AllDirectories);
                Array.Sort(allFiles, StringComparer.OrdinalIgnoreCase);

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

                            await ApplySeedIdsToCreatedItemsAsync(
                                db,
                                items,
                                result.Value,
                                cancellationToken);
                            
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
                resolvedSeedRoot,
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
        string? resolvedSeedRoot,
        CancellationToken cancellationToken)
    {
        HomeSampleCollectionSeedData seedData = await LoadHomeSampleCollectionSeedDataAsync(
            resolvedSeedRoot,
            cancellationToken);
        List<Guid> sampleItemIds = await ResolveHomeSampleItemIdsAsync(db, seedData, cancellationToken);
        if (sampleItemIds.Count == 0)
        {
            _logger.LogWarning("No public items available for the homepage sample collection. Skipping collection seed.");
            return;
        }

        Collection? collection = await db.Collections
            .FirstOrDefaultAsync(c => c.Id == seedData.Id, cancellationToken);

        if (collection is null)
        {
            collection = new Collection
            {
                Id = seedData.Id,
                Name = seedData.Name,
                Description = seedData.Description,
                CreatedBy = "seeder",
                CreatedAt = DateTime.UtcNow,
                IsPublic = true,
            };
            await db.Collections.AddAsync(collection, cancellationToken);
        }
        else
        {
            collection.Name = seedData.Name;
            collection.Description = seedData.Description;
            collection.IsPublic = true;
            collection.UpdatedAt = DateTime.UtcNow;
        }

        List<CollectionItem> existingLinks = await db.CollectionItems
            .Where(ci => ci.CollectionId == seedData.Id)
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
                CollectionId = seedData.Id,
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
            seedData.Id,
            sampleItemIds.Count);
    }

    private async Task<List<Guid>> ResolveHomeSampleItemIdsAsync(
        ApplicationDbContext db,
        HomeSampleCollectionSeedData seedData,
        CancellationToken cancellationToken)
    {
        IQueryable<Item> query = db.Items
            .AsNoTracking()
            .Where(i => !i.IsPrivate)
            .Where(i => i.CreatedBy == "seeder")
            .Where(i => i.Category != null && i.Category.Name == "trivia");

        if (seedData.ItemSeedIds.Count > 0)
        {
            query = query.Where(i => i.SeedId.HasValue && seedData.ItemSeedIds.Contains(i.SeedId.Value));
        }
        else if (seedData.ItemQuestions.Count > 0)
        {
            query = query.Where(i => seedData.ItemQuestions.Contains(i.Question));
        }
        else
        {
            return [];
        }

        List<Item> items = await query
            .OrderBy(i => i.CreatedAt)
            .ToListAsync(cancellationToken);

        if (items.Count < seedData.ItemSeedIds.Count && seedData.ItemQuestions.Count > 0)
        {
            items = await db.Items
                .AsNoTracking()
                .Where(i => !i.IsPrivate)
                .Where(i => i.CreatedBy == "seeder")
                .Where(i => i.Category != null && i.Category.Name == "trivia")
                .Where(i => seedData.ItemQuestions.Contains(i.Question))
                .OrderBy(i => i.CreatedAt)
                .ToListAsync(cancellationToken);
        }

        return items
            .Select(i => i.Id)
            .Distinct()
            .ToList();
    }

    private async Task<HomeSampleCollectionSeedData> LoadHomeSampleCollectionSeedDataAsync(
        string? resolvedSeedRoot,
        CancellationToken cancellationToken)
    {
        string? collectionPath = ResolveHomeSampleCollectionPath(resolvedSeedRoot);
        if (collectionPath is null)
        {
            return BuildFallbackHomeSampleCollectionSeedData();
        }

        string raw = await File.ReadAllTextAsync(collectionPath, cancellationToken);
        HomeSampleCollectionSeedData? data = JsonSerializer.Deserialize<HomeSampleCollectionSeedData>(
            raw,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (data is null)
        {
            _logger.LogWarning("Home sample collection file {CollectionPath} was empty. Falling back to defaults.", collectionPath);
            return BuildFallbackHomeSampleCollectionSeedData();
        }

        return data;
    }

    private static HomeSampleCollectionSeedData BuildFallbackHomeSampleCollectionSeedData()
    {
        return new HomeSampleCollectionSeedData
        {
            Id = HomeSampleCollectionId,
            Name = "Fun Trivia Facts",
            Description = "A public five-item trivia sampler with surprising facts and easy conversation-starter questions.",
            ItemQuestions =
            [
                "What color is the \"black box\" recorder on most commercial airplanes?",
                "What animal's fingerprints are so close to humans that they can confuse crime-scene analysis?",
                "Which planet has a day longer than its year?",
                "What is the national animal of Scotland?",
                "What everyday food never really spoils when stored properly?"
            ]
        };
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

    private static string? ResolveSeedItemsPath(string resolvedSeedRoot)
    {
        string candidate = Path.Combine(resolvedSeedRoot, SeedItemsFolderName);
        if (Directory.Exists(candidate))
        {
            return candidate;
        }

        return Directory.Exists(resolvedSeedRoot) ? resolvedSeedRoot : null;
    }

    private static string? ResolveHomeSampleCollectionPath(string? resolvedSeedRoot)
    {
        if (string.IsNullOrWhiteSpace(resolvedSeedRoot))
        {
            return null;
        }

        string candidate = Path.Combine(
            resolvedSeedRoot,
            SampleCollectionsFolderName,
            HomeSampleCollectionFileName);

        return File.Exists(candidate) ? candidate : null;
    }

    private async Task ApplySeedIdsToCreatedItemsAsync(
        ApplicationDbContext db,
        List<BulkItemSeedData> sourceItems,
        AddItemsBulk.Response response,
        CancellationToken cancellationToken)
    {
        if (response.CreatedItemIds is null || response.CreatedItemIds.Count == 0)
        {
            return;
        }

        List<Guid?> sourceSeedIds = sourceItems.Select(item => item.SeedId).ToList();
        if (response.CreatedItemIds.Count != sourceSeedIds.Count)
        {
            _logger.LogWarning(
                "Skipping seedId assignment because created item count {CreatedCount} did not match source item count {SourceCount}.",
                response.CreatedItemIds.Count,
                sourceSeedIds.Count);
            return;
        }

        List<Item> createdItems = await db.Items
            .Where(item => response.CreatedItemIds.Contains(item.Id))
            .ToListAsync(cancellationToken);

        Dictionary<Guid, Item> itemById = createdItems.ToDictionary(item => item.Id);
        bool changed = false;

        for (int index = 0; index < response.CreatedItemIds.Count; index++)
        {
            Guid? seedId = sourceSeedIds[index];
            if (!seedId.HasValue)
            {
                continue;
            }

            if (!itemById.TryGetValue(response.CreatedItemIds[index], out Item? item))
            {
                continue;
            }

            if (item.SeedId == seedId.Value)
            {
                continue;
            }

            item.SeedId = seedId.Value;
            changed = true;
        }

        if (changed)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Seed data model for JSON deserialization (bulk format)
internal sealed class BulkItemSeedData
{
    public Guid? SeedId { get; set; }
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

internal sealed class HomeSampleCollectionSeedData
{
    public Guid Id { get; set; } = new("8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511");
    public string Name { get; set; } = "Fun Trivia Facts";
    public string Description { get; set; } =
        "A public five-item trivia sampler with surprising facts and easy conversation-starter questions.";
    public List<Guid> ItemSeedIds { get; set; } = [];
    public List<string> ItemQuestions { get; set; } = [];
}
