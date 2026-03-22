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
    ITaxonomyRegistry taxonomyRegistry) : IHostedService
{
    private readonly ILogger<DatabaseSeederHostedService> _logger = logger;
    private readonly IServiceProvider _serviceProvider = serviceProvider;
    private readonly ISimHashService _simHashService = simHashService;
    private readonly IWebHostEnvironment _environment = environment;
    private readonly SeedOptions _seedOptions = seedOptions.Value;
    private readonly ITaxonomyRegistry _taxonomyRegistry = taxonomyRegistry;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Migrations are applied in Program.cs before the app accepts requests.
        // Apply any pending migrations here so schema is up to date before seeding (idempotent; no-op if already applied).
        try
        {
            using IServiceScope scope = _serviceProvider.CreateScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

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

                        ITaxonomyItemCategoryResolver itemCategoryResolver = scope.ServiceProvider.GetRequiredService<ITaxonomyItemCategoryResolver>();
                        ITaxonomyRegistry taxonomyRegistry = scope.ServiceProvider.GetRequiredService<ITaxonomyRegistry>();
                        IAuditService auditService = scope.ServiceProvider.GetRequiredService<IAuditService>();
                        IProfanityFilterService profanityFilter = scope.ServiceProvider.GetRequiredService<IProfanityFilterService>();

                        Result<AddItemsBulk.Response> result = await AddItemsBulkHandler.HandleAsync(
                            bulkRequest,
                            db,
                            _simHashService,
                            seederUserContext,
                            itemCategoryResolver,
                            taxonomyRegistry,
                            auditService,
                            profanityFilter,
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
            .FirstOrDefaultAsync(c => c.Name.ToLower() == "science", cancellationToken);

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
        _logger.LogInformation("Seeding categories and navigation keywords from taxonomy...");

        Dictionary<string, Category> categories = new(StringComparer.OrdinalIgnoreCase);

        foreach (string categorySlug in _taxonomyRegistry.CategorySlugs)
        {
            TaxonomyCategoryDefinition? def = _taxonomyRegistry.GetCategory(categorySlug);
            if (def is null)
                continue;

            string shortDesc = ShortDescriptionFromCategory(def.Description);
            Category? existingCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.Name.ToLower() == categorySlug.ToLower(), cancellationToken);

            if (existingCategory is null)
            {
                Category newCategory = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = categorySlug,
                    Description = def.Description,
                    ShortDescription = shortDesc,
                    IsPrivate = false,
                    CreatedBy = "seeder",
                    CreatedAt = DateTime.UtcNow
                };
                db.Categories.Add(newCategory);
                await db.SaveChangesAsync(cancellationToken);
                categories[categorySlug] = newCategory;
                _logger.LogInformation("Created category: {CategoryName}", categorySlug);
            }
            else
            {
                existingCategory.Description = def.Description;
                existingCategory.ShortDescription = shortDesc;
                await db.SaveChangesAsync(cancellationToken);
                categories[categorySlug] = existingCategory;
            }
        }

        const string otherKeywordDescription = "Items not in a specific subcategory.";

        foreach ((string _, Category category) in categories)
        {
            await SeedOtherKeywordAsync(db, category, cancellationToken, otherKeywordDescription);
        }

        foreach (string categorySlug in _taxonomyRegistry.CategorySlugs)
        {
            TaxonomyCategoryDefinition? def = _taxonomyRegistry.GetCategory(categorySlug);
            if (def is null || !categories.TryGetValue(categorySlug, out Category? category))
                continue;

            for (int i = 0; i < def.L1Groups.Count; i++)
            {
                TaxonomyL1Group l1 = def.L1Groups[i];
                await SeedNavigationKeywordAsync(
                    db,
                    category,
                    l1.Slug,
                    navigationRank: 1,
                    parentName: null,
                    sortRank: i + 1,
                    cancellationToken,
                    string.IsNullOrWhiteSpace(l1.Description) ? null : l1.Description);

                for (int j = 0; j < l1.L2Leaves.Count; j++)
                {
                    TaxonomyL2Leaf l2 = l1.L2Leaves[j];
                    await SeedNavigationKeywordAsync(
                        db,
                        category,
                        l2.Slug,
                        navigationRank: 2,
                        parentName: l1.Slug,
                        sortRank: j,
                        cancellationToken,
                        string.IsNullOrWhiteSpace(l2.Description) ? null : l2.Description);
                }
            }
        }

        _logger.LogInformation("Categories and navigation keywords seeding completed.");
    }

    private static string ShortDescriptionFromCategory(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return "";
        string[] words = description.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return words.Length <= 5 ? string.Join(" ", words) : string.Join(" ", words.Take(5));
    }

    private async Task SeedOtherKeywordAsync(
        ApplicationDbContext db,
        Category category,
        CancellationToken cancellationToken,
        string? description = null)
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

        bool exists = await db.KeywordRelations.AnyAsync(kr =>
            kr.CategoryId == category.Id && kr.ParentKeywordId == null && kr.ChildKeywordId == otherKeyword.Id,
            cancellationToken);

        if (exists)
        {
            if (description is not null)
            {
                KeywordRelation? kr = await db.KeywordRelations.FirstOrDefaultAsync(kr =>
                    kr.CategoryId == category.Id && kr.ChildKeywordId == otherKeyword.Id, cancellationToken);
                if (kr != null) { kr.Description = description; await db.SaveChangesAsync(cancellationToken); }
            }
            return;
        }

        db.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            ParentKeywordId = null,
            ChildKeywordId = otherKeyword.Id,
            SortOrder = 0,
            Description = description,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedNavigationKeywordAsync(
        ApplicationDbContext db,
        Category category,
        string keywordName,
        int navigationRank,
        string? parentName,
        int sortRank,
        CancellationToken cancellationToken,
        string? description = null)
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

        Guid? parentKeywordId = null;
        if (navigationRank == 2 && !string.IsNullOrWhiteSpace(parentName))
        {
            Keyword? parentKw = await db.Keywords.FirstOrDefaultAsync(k => k.Name.ToLower() == parentName.ToLower(), cancellationToken);
            if (parentKw != null)
            {
                bool parentIsRoot = await db.KeywordRelations.AnyAsync(kr =>
                    kr.CategoryId == category.Id && kr.ParentKeywordId == null && kr.ChildKeywordId == parentKw.Id,
                    cancellationToken);
                if (parentIsRoot)
                    parentKeywordId = parentKw.Id;
            }
        }

        bool exists = await db.KeywordRelations.AnyAsync(kr =>
            kr.CategoryId == category.Id && kr.ParentKeywordId == parentKeywordId && kr.ChildKeywordId == keyword.Id,
            cancellationToken);

        if (exists)
        {
            if (description is not null)
            {
                KeywordRelation? kr = await db.KeywordRelations.FirstOrDefaultAsync(kr =>
                    kr.CategoryId == category.Id && kr.ChildKeywordId == keyword.Id, cancellationToken);
                if (kr != null) { kr.Description = description; await db.SaveChangesAsync(cancellationToken); }
            }
            return;
        }

        db.KeywordRelations.Add(new KeywordRelation
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            ParentKeywordId = parentKeywordId,
            ChildKeywordId = keyword.Id,
            SortOrder = sortRank,
            Description = description,
            CreatedAt = DateTime.UtcNow
        });
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
