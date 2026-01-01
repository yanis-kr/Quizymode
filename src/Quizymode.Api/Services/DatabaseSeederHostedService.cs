using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Helpers;
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
                        Dictionary<int, Item> itemIndexMap = new(); // Map index to item for keyword association
                        int itemIndex = 0;
                        
                        // Normalize category and subcategory to capitalized format (once per file)
                        string normalizedCategory = CategoryHelper.Normalize(itemsData.Category);
                        string normalizedSubcategory = CategoryHelper.Normalize(itemsData.Subcategory);
                        
                        foreach (ItemSeedData itemData in itemsData.Items)
                        {
                            // Compute SimHash for duplicate detection
                            string questionText = $"{itemData.Question} {itemData.CorrectAnswer} {string.Join(" ", itemData.IncorrectAnswers)}";
                            string fuzzySignature = _simHashService.ComputeSimHash(questionText);
                            int fuzzyBucket = _simHashService.GetFuzzyBucket(fuzzySignature);

                            Item item = new Item
                            {
                                Id = Guid.NewGuid(),
                                Category = normalizedCategory,
                                Subcategory = normalizedSubcategory,
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
                            itemIndexMap[itemIndex++] = item;
                        }

                        if (itemsToInsert.Any())
                        {
                            db.Items.AddRange(itemsToInsert);
                            await db.SaveChangesAsync(cancellationToken);
                            _logger.LogInformation("Inserted {Count} items for {Category}/{Subcategory}", 
                                itemsToInsert.Count, itemsData.Category, itemsData.Subcategory);
                            
                            // Handle keywords for seeded items
                            List<ItemKeyword> itemKeywordsToInsert = new();
                            Dictionary<string, Keyword> keywordCache = new();
                            string seederUserId = "seeder";
                            
                            itemIndex = 0;
                            foreach (ItemSeedData itemData in itemsData.Items)
                            {
                                Item item = itemIndexMap[itemIndex++];
                                
                                // Assign single most appropriate keyword based on content
                                // Extract keywords from question content to determine topic
                                string questionText = $"{itemData.Question} {itemData.CorrectAnswer} {string.Join(" ", itemData.IncorrectAnswers)}";
                                HashSet<string> extractedKeywords = ExtractKeywordsFromText(questionText);
                                
                                // Map to single most appropriate topic keyword
                                string? topicKeyword = GetMostAppropriateKeyword(extractedKeywords, questionText, normalizedCategory, normalizedSubcategory);
                                
                                // Use explicit keyword from seed data if provided, otherwise use topic keyword
                                string? keywordToAdd = null;
                                if (itemData.Keywords is not null && itemData.Keywords.Count > 0)
                                {
                                    // Use first explicit keyword if provided
                                    string explicitKeyword = itemData.Keywords[0].Trim().ToLowerInvariant();
                                    if (!string.IsNullOrEmpty(explicitKeyword) && explicitKeyword.Length <= 10)
                                    {
                                        keywordToAdd = explicitKeyword;
                                    }
                                }
                                
                                if (string.IsNullOrEmpty(keywordToAdd) && !string.IsNullOrEmpty(topicKeyword))
                                {
                                    keywordToAdd = topicKeyword;
                                }
                                
                                // Only add keyword if we have one
                                if (!string.IsNullOrEmpty(keywordToAdd))
                                {
                                    string cacheKey = $"{keywordToAdd}:global";
                                    
                                    if (!keywordCache.TryGetValue(cacheKey, out Keyword? keyword))
                                    {
                                        // Find or create global keyword
                                        keyword = await db.Keywords
                                            .FirstOrDefaultAsync(k => 
                                                k.Name == keywordToAdd && 
                                                k.IsPrivate == false,
                                                cancellationToken);
                                        
                                        if (keyword is null)
                                        {
                                            keyword = new Keyword
                                            {
                                                Id = Guid.NewGuid(),
                                                Name = keywordToAdd,
                                                IsPrivate = false, // Seed keywords are global
                                                CreatedBy = seederUserId,
                                                CreatedAt = DateTime.UtcNow
                                            };
                                            db.Keywords.Add(keyword);
                                            await db.SaveChangesAsync(cancellationToken);
                                        }
                                        
                                        keywordCache[cacheKey] = keyword;
                                    }
                                    
                                    // Create ItemKeyword relationship
                                    ItemKeyword itemKeyword = new ItemKeyword
                                    {
                                        Id = Guid.NewGuid(),
                                        ItemId = item.Id,
                                        KeywordId = keyword.Id,
                                        AddedAt = DateTime.UtcNow
                                    };
                                    itemKeywordsToInsert.Add(itemKeyword);
                                }
                            }
                            
                            if (itemKeywordsToInsert.Count > 0)
                            {
                                db.ItemKeywords.AddRange(itemKeywordsToInsert);
                                await db.SaveChangesAsync(cancellationToken);
                                _logger.LogInformation("Added {Count} keyword associations for {Category}/{Subcategory}", 
                                    itemKeywordsToInsert.Count, itemsData.Category, itemsData.Subcategory);
                            }
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
    
    /// <summary>
    /// Extracts meaningful keywords from text (capitalized words, place names, etc.)
    /// </summary>
    private static HashSet<string> ExtractKeywordsFromText(string text)
    {
        HashSet<string> keywords = new();
        
        // Common words to skip
        HashSet<string> skipWords = new(StringComparer.OrdinalIgnoreCase)
        {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
            "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
            "what", "which", "where", "when", "who", "why", "how", "can", "could", "should", "would",
            "this", "that", "these", "those", "it", "its", "they", "them", "their", "there", "here"
        };
        
        // Extract capitalized words and common place/entity names
        string[] words = text.Split(new[] { ' ', '.', ',', '!', '?', ':', ';', '\'', '"', '(', ')', '[', ']', '{', '}' }, 
            StringSplitOptions.RemoveEmptyEntries);
        
        foreach (string word in words)
        {
            string cleaned = word.Trim().ToLowerInvariant();
            
            // Skip if too short, too long, or in skip list
            if (cleaned.Length < 3 || cleaned.Length > 10 || skipWords.Contains(cleaned))
            {
                continue;
            }
            
            // Add if it's a capitalized word (likely a proper noun) or a meaningful term
            if (char.IsUpper(word[0]) || IsMeaningfulKeyword(cleaned))
            {
                keywords.Add(cleaned);
            }
        }
        
        return keywords;
    }
    
    /// <summary>
    /// Checks if a word is a meaningful keyword (not a common word)
    /// </summary>
    private static bool IsMeaningfulKeyword(string word)
    {
        // Add domain-specific meaningful terms
        HashSet<string> meaningfulTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "ocean", "oceans", "planet", "planets", "capital", "capitals", "city", "cities",
            "country", "countries", "continent", "continents", "language", "languages",
            "number", "numbers", "greeting", "greetings", "word", "words"
        };
        
        return meaningfulTerms.Contains(word);
    }
    
    /// <summary>
    /// Gets the single most appropriate keyword for an item based on content.
    /// Returns the most relevant topic keyword (e.g., "geography", "science", "greetings").
    /// </summary>
    private static string? GetMostAppropriateKeyword(
        HashSet<string> extractedKeywords, 
        string fullText, 
        string category, 
        string subcategory)
    {
        string textLower = fullText.ToLowerInvariant();
        string categoryLower = category.ToLowerInvariant();
        string subcategoryLower = subcategory.ToLowerInvariant();
        
        // Geography-related keywords
        HashSet<string> geographyTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "paris", "france", "ocean", "oceans", "atlantic", "pacific", "indian", "arctic",
            "capital", "capitals", "city", "cities", "country", "countries", "continent", "continents",
            "europe", "asia", "africa", "america", "spain", "germany", "italy", "london", "madrid"
        };
        
        // Science/Astronomy-related keywords
        HashSet<string> scienceTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "mars", "planet", "planets", "venus", "jupiter", "saturn", "earth", "moon", "sun",
            "solar", "system", "astronomy", "space", "galaxy", "star", "stars"
        };
        
        // Language-related keywords
        HashSet<string> languageTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "spanish", "french", "english", "german", "italian", "greeting", "greetings",
            "hello", "hola", "bonjour", "goodbye", "adios", "au revoir", "word", "words",
            "number", "numbers", "uno", "dos", "tres", "un", "deux", "trois"
        };
        
        // Check for geography content
        bool hasGeography = extractedKeywords.Any(k => geographyTerms.Contains(k)) ||
                           textLower.Contains("capital") || textLower.Contains("ocean") ||
                           textLower.Contains("country") || textLower.Contains("city");
        
        // Check for science content
        bool hasScience = extractedKeywords.Any(k => scienceTerms.Contains(k)) ||
                         textLower.Contains("planet") || textLower.Contains("mars") ||
                         textLower.Contains("solar");
        
        // Check for language content
        bool hasLanguage = extractedKeywords.Any(k => languageTerms.Contains(k)) ||
                          textLower.Contains("greeting") || textLower.Contains("say") ||
                          textLower.Contains("word") || textLower.Contains("number");
        
        // Priority: Geography > Science > Language
        if (hasGeography)
        {
            return "geography";
        }
        
        if (hasScience)
        {
            return "science";
        }
        
        if (hasLanguage)
        {
            // Determine specific language keyword
            if (textLower.Contains("spanish") || textLower.Contains("hola") || textLower.Contains("adios") ||
                textLower.Contains("uno") || textLower.Contains("dos") || textLower.Contains("tres"))
            {
                return "greetings"; // For Spanish greetings/numbers
            }
            
            if (textLower.Contains("french") || textLower.Contains("bonjour") || textLower.Contains("au revoir") ||
                textLower.Contains("un") || textLower.Contains("deux") || textLower.Contains("trois"))
            {
                return "greetings"; // For French greetings/numbers
            }
            
            if (textLower.Contains("greeting") || textLower.Contains("hello") || textLower.Contains("goodbye"))
            {
                return "greetings";
            }
            
            if (textLower.Contains("number") || textLower.Contains("numbers"))
            {
                return "numbers";
            }
            
            return "greetings"; // Default for language content
        }
        
        // If category/subcategory are meaningful, use them
        if (categoryLower != "general" && categoryLower != "misc" && categoryLower != "miscellaneous" &&
            categoryLower.Length <= 10)
        {
            return categoryLower;
        }
        
        if (subcategoryLower != "misc" && subcategoryLower != "general" && subcategoryLower != "miscellaneous" &&
            subcategoryLower.Length <= 10)
        {
            return subcategoryLower;
        }
        
        return null; // No appropriate keyword found
    }
    
    /// <summary>
    /// Maps extracted keywords to meaningful topic keywords (e.g., Geography, Science, etc.)
    /// DEPRECATED: Use GetMostAppropriateKeyword instead for single keyword assignment.
    /// </summary>
    [Obsolete("Use GetMostAppropriateKeyword instead for single keyword assignment")]
    private static HashSet<string> MapToTopicKeywords(HashSet<string> extractedKeywords, string fullText)
    {
        HashSet<string> topicKeywords = new();
        string textLower = fullText.ToLowerInvariant();
        
        // Geography-related keywords
        HashSet<string> geographyTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "paris", "france", "ocean", "oceans", "atlantic", "pacific", "indian", "arctic",
            "capital", "capitals", "city", "cities", "country", "countries", "continent", "continents",
            "europe", "asia", "africa", "america", "spain", "germany", "italy", "london", "madrid"
        };
        
        // Science/Astronomy-related keywords
        HashSet<string> scienceTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "mars", "planet", "planets", "venus", "jupiter", "saturn", "earth", "moon", "sun",
            "solar", "system", "astronomy", "space", "galaxy", "star", "stars"
        };
        
        // Language-related keywords
        HashSet<string> languageTerms = new(StringComparer.OrdinalIgnoreCase)
        {
            "spanish", "french", "english", "german", "italian", "greeting", "greetings",
            "hello", "hola", "bonjour", "goodbye", "adios", "au revoir", "word", "words",
            "number", "numbers", "uno", "dos", "tres", "un", "deux", "trois"
        };
        
        // Check if any extracted keywords match these categories
        bool hasGeography = extractedKeywords.Any(k => geographyTerms.Contains(k)) ||
                           textLower.Contains("capital") || textLower.Contains("ocean") ||
                           textLower.Contains("country") || textLower.Contains("city");
        
        bool hasScience = extractedKeywords.Any(k => scienceTerms.Contains(k)) ||
                         textLower.Contains("planet") || textLower.Contains("mars") ||
                         textLower.Contains("solar");
        
        bool hasLanguage = extractedKeywords.Any(k => languageTerms.Contains(k)) ||
                          textLower.Contains("greeting") || textLower.Contains("say") ||
                          textLower.Contains("word") || textLower.Contains("number");
        
        // Add topic keywords
        if (hasGeography)
        {
            topicKeywords.Add("geography");
        }
        
        if (hasScience)
        {
            topicKeywords.Add("science");
        }
        
        if (hasLanguage)
        {
            // Determine specific language
            if (textLower.Contains("spanish") || textLower.Contains("hola") || textLower.Contains("adios"))
            {
                topicKeywords.Add("spanish");
                topicKeywords.Add("greetings");
            }
            else if (textLower.Contains("french") || textLower.Contains("bonjour") || textLower.Contains("au revoir"))
            {
                topicKeywords.Add("french");
                topicKeywords.Add("greetings");
            }
            else if (textLower.Contains("number") || textLower.Contains("uno") || textLower.Contains("un"))
            {
                if (textLower.Contains("uno") || textLower.Contains("dos") || textLower.Contains("tres"))
                {
                    topicKeywords.Add("spanish");
                }
                else if (textLower.Contains("un") || textLower.Contains("deux") || textLower.Contains("trois"))
                {
                    topicKeywords.Add("french");
                }
                topicKeywords.Add("numbers");
            }
        }
        
        // Also add specific place/entity names that are meaningful
        foreach (string keyword in extractedKeywords)
        {
            if (keyword.Length <= 10 && 
                (geographyTerms.Contains(keyword) || scienceTerms.Contains(keyword) || languageTerms.Contains(keyword)))
            {
                topicKeywords.Add(keyword);
            }
        }
        
        return topicKeywords;
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
    public List<string>? Keywords { get; set; } // Optional keywords for seeding
}
