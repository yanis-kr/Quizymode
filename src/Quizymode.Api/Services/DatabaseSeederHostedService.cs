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

                        // Convert to AddItemsBulk.Request format from JSON; exclude keywords that match the category name
                        List<AddItemsBulk.ItemRequest> itemRequests = items.Select(item =>
                        {
                            string category = item.Category.Trim();
                            List<string>? keywords = item.Keywords?
                                .Where(k => !string.Equals(k.Trim(), category, StringComparison.OrdinalIgnoreCase))
                                .Select(k => k.Trim())
                                .Where(k => !string.IsNullOrEmpty(k))
                                .ToList();
                            return new AddItemsBulk.ItemRequest(
                                Category: category,
                                Question: item.Question,
                                CorrectAnswer: item.CorrectAnswer,
                                IncorrectAnswers: item.IncorrectAnswers,
                                Explanation: item.Explanation ?? string.Empty,
                                Keywords: keywords?.Count > 0 ? keywords.Select(k => new AddItemsBulk.KeywordRequest(k, false)).ToList() : null,
                                Source: item.Source
                            );
                        }).ToList();

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

        // Fixed categories with one-liner description and 4-5 word short description
        var categoryDefinitions = new Dictionary<string, (string Description, string ShortDescription)>
        {
            { "general", ("Mixed trivia, world records, fun facts, and daily quizzes.", "Trivia, records, fun facts") },
            { "history", ("World and regional history, biographies, and historical events.", "World & regional history") },
            { "science", ("Biology, astronomy, physics, chemistry, and earth science.", "Science subjects & concepts") },
            { "geography", ("Countries, capitals, states, flags, and maps.", "Places, capitals, maps") },
            { "entertainment", ("Movies, TV shows, songs & artists, quotes, and pop culture.", "Movies, TV, songs & artists") },
            { "culture", ("Food, holidays, traditions, customs, and slang.", "Food, holidays, customs") },
            { "language", ("Vocabulary, grammar, and idioms for language learning.", "Language learning & vocabulary") },
            { "literature", ("Books, authors, literary terms, and reading comprehension.", "Books, authors, literary terms") },
            { "arts", ("Visual arts, music theory & composition, film as art, design, and creative disciplines.", "Visual arts, music theory, design") },
            { "puzzles", ("Riddles, logic, brain teasers, and math puzzles.", "Riddles, logic, brain teasers") },
            { "sports", ("Soccer, basketball, tennis, Olympics, and athletes.", "Sports & athletics") },
            { "tests", ("Standardized and academic exams: ACT, SAT, GMAT, GRE, NCLEX.", "Academic & licensing exams") },
            { "certs", ("Professional certifications: AWS, Azure, GCP, CompTIA, Kubernetes.", "Professional certifications") },
            { "outdoors", ("Survival, camping, and navigation skills.", "Survival, camping, navigation") },
            { "nature", ("Animals, plants, ecosystems, and natural phenomena.", "Animals, plants, ecosystems") }
        };

        // Seed categories (if missing) and update descriptions for existing
        Dictionary<string, Category> categories = new();
        foreach ((string categoryName, (string description, string shortDescription)) in categoryDefinitions)
        {
            Category? existingCategory = await db.Categories
                .FirstOrDefaultAsync(c => c.Name.ToLower() == categoryName.ToLower(), cancellationToken);

            if (existingCategory is null)
            {
                Category newCategory = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = categoryName,
                    Description = description,
                    ShortDescription = shortDescription,
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
                existingCategory.Description = description;
                existingCategory.ShortDescription = shortDescription;
                await db.SaveChangesAsync(cancellationToken);
                categories[categoryName] = existingCategory;
            }
        }

        const string otherKeywordDescription = "Items not in a specific subcategory.";

        // Seed "other" keyword for each category (if missing)
        foreach ((string categoryName, Category category) in categories)
        {
            await SeedOtherKeywordAsync(db, category, cancellationToken, otherKeywordDescription);
        }

        // Short descriptions for rank-1 navigation keywords (category, keyword) -> description
        var rank1Descriptions = new Dictionary<(string Category, string Keyword), string>
        {
            { ("general", "world-records"), "Record-breaking facts and achievements" },
            { ("general", "trivia"), "General knowledge and quiz questions" },
            { ("general", "fun-facts"), "Unexpected and entertaining facts" },
            { ("general", "daily"), "Daily and time-based quizzes" },
            { ("general", "mixed"), "Mixed topics" },
            { ("general", "random"), "Random selection across topics" },
            { ("history", "us-history"), "United States history" },
            { ("history", "world-history"), "Global history and events" },
            { ("history", "ancient"), "Ancient civilizations and empires" },
            { ("history", "modern"), "Modern history" },
            { ("history", "biography"), "Notable figures and life stories" },
            { ("science", "biology"), "Living organisms and life processes" },
            { ("science", "astronomy"), "Space, stars, and planets" },
            { ("science", "physics"), "Matter, energy, and forces" },
            { ("science", "chemistry"), "Elements, compounds, and reactions" },
            { ("science", "earth-science"), "Earth systems, geology, climate" },
            { ("geography", "countries"), "Countries and sovereign states" },
            { ("geography", "capitals"), "National and regional capitals" },
            { ("geography", "us-states"), "U.S. states and territories" },
            { ("geography", "flags"), "Flags and symbolism" },
            { ("geography", "maps"), "Maps and spatial data" },
            { ("entertainment", "movies"), "Films and cinema" },
            { ("entertainment", "tv"), "Television shows and series" },
            { ("entertainment", "music"), "Songs, artists, and genres" },
            { ("entertainment", "quotes"), "Famous lines and quotes" },
            { ("entertainment", "pop-culture"), "Trends, memes, and popular culture" },
            { ("culture", "food"), "Cuisine and food culture" },
            { ("culture", "holidays"), "Holidays and celebrations" },
            { ("culture", "traditions"), "Customs and traditions" },
            { ("culture", "customs"), "Social customs and etiquette" },
            { ("culture", "slang"), "Slang and informal language" },
            { ("language", "spanish"), "Spanish language" },
            { ("language", "french"), "French language" },
            { ("language", "english"), "English language" },
            { ("language", "vocabulary"), "Words and definitions" },
            { ("language", "idioms"), "Idioms and expressions" },
            { ("literature", "fiction"), "Fiction and storytelling" },
            { ("literature", "nonfiction"), "Nonfiction and factual works" },
            { ("literature", "authors"), "Writers and their works" },
            { ("literature", "literary-terms"), "Terms and techniques" },
            { ("literature", "poetry"), "Poetry and verse" },
            { ("literature", "classics"), "Classic literature" },
            { ("arts", "visual-arts"), "Painting, sculpture, and visual art" },
            { ("arts", "music-theory"), "Music theory and composition" },
            { ("arts", "film"), "Film as art" },
            { ("arts", "design"), "Design and visual design" },
            { ("arts", "photography"), "Photography and images" },
            { ("puzzles", "riddles"), "Riddles and word puzzles" },
            { ("puzzles", "logic"), "Logic and reasoning" },
            { ("puzzles", "brain-teasers"), "Brain teasers and puzzles" },
            { ("puzzles", "math-puzzles"), "Math and number puzzles" },
            { ("puzzles", "patterns"), "Patterns and sequences" },
            { ("sports", "soccer"), "Soccer / football" },
            { ("sports", "basketball"), "Basketball" },
            { ("sports", "tennis"), "Tennis" },
            { ("sports", "olympics"), "Olympic games and events" },
            { ("sports", "athletes"), "Athletes and performance" },
            { ("tests", "act"), "ACT exam" },
            { ("tests", "sat"), "SAT exam" },
            { ("tests", "gmat"), "GMAT" },
            { ("tests", "gre"), "GRE" },
            { ("tests", "nclex"), "NCLEX nursing exam" },
            { ("certs", "aws"), "Amazon Web Services" },
            { ("certs", "azure"), "Microsoft Azure" },
            { ("certs", "gcp"), "Google Cloud Platform" },
            { ("certs", "comptia"), "CompTIA certifications" },
            { ("certs", "kubernetes"), "Kubernetes and containers" },
            { ("outdoors", "survival"), "Survival skills and scenarios" },
            { ("outdoors", "camping"), "Camping and outdoor basics" },
            { ("outdoors", "navigation"), "Orienteering and navigation" },
            { ("nature", "animals"), "Animals and wildlife" },
            { ("nature", "plants"), "Plants and botany" },
            { ("nature", "ecosystems"), "Ecosystems and biomes" },
            { ("nature", "phenomena"), "Natural phenomena and events" }
        };

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
            { "literature", new List<string> { "fiction", "nonfiction", "authors", "literary-terms", "poetry", "classics" } },
            { "arts", new List<string> { "visual-arts", "music-theory", "film", "design", "photography" } },
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
                    string kw = keywords[i];
                    rank1Descriptions.TryGetValue((categoryName, kw), out string? desc);
                    await SeedNavigationKeywordAsync(
                        db,
                        category,
                        kw,
                        navigationRank: 1,
                        parentName: null,
                        sortRank: i + 1, // Start at 1 (0 is reserved for "other")
                        cancellationToken,
                        desc);
                }
            }
        }

        // Short descriptions for rank-2 navigation keywords (category, parent, keyword) -> description
        var rank2Descriptions = new Dictionary<(string Category, string Parent, string Keyword), string>
        {
            { ("general", "world-records", "humans"), "Human records and feats" },
            { ("general", "world-records", "animals"), "Animal records" },
            { ("general", "world-records", "weird"), "Unusual and odd records" },
            { ("certs", "aws", "saa-c02"), "Solutions Architect Associate" },
            { ("certs", "aws", "saa-c03"), "Solutions Architect Associate (newer)" },
            { ("certs", "aws", "dva-c02"), "Developer Associate" },
            { ("certs", "aws", "soa-c02"), "SysOps Administrator Associate" },
            { ("tests", "act", "math"), "ACT Math" },
            { ("tests", "act", "reading"), "ACT Reading" },
            { ("tests", "act", "english"), "ACT English" },
            { ("tests", "act", "science"), "ACT Science" },
            { ("tests", "sat", "math"), "SAT Math" },
            { ("tests", "sat", "reading"), "SAT Reading" },
            { ("tests", "sat", "writing"), "SAT Writing" },
            { ("tests", "nclex", "med-surg"), "Medical-surgical nursing" },
            { ("tests", "nclex", "pediatrics"), "Pediatric nursing" },
            { ("tests", "nclex", "pharm"), "Pharmacology" },
            { ("tests", "nclex", "dosage-calc"), "Dosage calculations" },
            { ("outdoors", "survival", "forest"), "Forest and woodland survival" },
            { ("outdoors", "survival", "tropical-island"), "Tropical island survival" },
            { ("outdoors", "camping", "basics"), "Camping fundamentals" },
            { ("nature", "animals", "predators"), "Predators and hunting" },
            { ("nature", "plants", "poisonous"), "Poisonous plants" },
            { ("nature", "ecosystems", "tundra"), "Tundra ecosystems" },
            { ("nature", "phenomena", "aurora"), "Aurora and northern lights" }
        };

        // Seed rank-2 keywords
        Dictionary<(string Category, string Parent), List<string>> rank2Keywords = new()
        {
            { ("general", "world-records"), new List<string> { "humans", "animals", "weird" } },
            { ("certs", "aws"), new List<string> { "saa-c02", "saa-c03", "dva-c02", "soa-c02" } },
            { ("tests", "act"), new List<string> { "math", "reading", "english", "science" } },
            { ("tests", "sat"), new List<string> { "math", "reading", "writing" } },
            { ("tests", "nclex"), new List<string> { "med-surg", "pediatrics", "pharm", "dosage-calc" } },
            { ("outdoors", "survival"), new List<string> { "forest", "tropical-island" } },
            { ("outdoors", "camping"), new List<string> { "basics" } },
            { ("nature", "animals"), new List<string> { "predators" } },
            { ("nature", "plants"), new List<string> { "poisonous" } },
            { ("nature", "ecosystems"), new List<string> { "tundra" } },
            { ("nature", "phenomena"), new List<string> { "aurora" } }
        };

        foreach (((string categoryName, string parentName), List<string> keywords) in rank2Keywords)
        {
            if (categories.TryGetValue(categoryName, out Category? category))
            {
                for (int i = 0; i < keywords.Count; i++)
                {
                    string kw = keywords[i];
                    rank2Descriptions.TryGetValue((categoryName, parentName, kw), out string? desc);
                    await SeedNavigationKeywordAsync(
                        db,
                        category,
                        kw,
                        navigationRank: 2,
                        parentName: parentName,
                        sortRank: i,
                        cancellationToken,
                        desc);
                }
            }
        }

        _logger.LogInformation("Categories and navigation keywords seeding completed.");
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

        CategoryKeyword? existing = await db.CategoryKeywords
            .FirstOrDefaultAsync(ck => ck.CategoryId == category.Id && ck.KeywordId == otherKeyword.Id, cancellationToken);

        if (existing is not null)
        {
            if (description is not null)
            {
                existing.Description = description;
                await db.SaveChangesAsync(cancellationToken);
            }
            return;
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
            Description = description,
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

        CategoryKeyword? existing = await db.CategoryKeywords
            .FirstOrDefaultAsync(ck => ck.CategoryId == category.Id && ck.KeywordId == keyword.Id, cancellationToken);

        if (existing is not null)
        {
            if (description is not null)
            {
                existing.Description = description;
                await db.SaveChangesAsync(cancellationToken);
            }
            return;
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
            Description = description,
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
