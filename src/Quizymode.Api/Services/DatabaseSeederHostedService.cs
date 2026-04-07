using System.Data;
using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Services.Taxonomy;

namespace Quizymode.Api.Services;

internal sealed class DatabaseSeederHostedService(
    ILogger<DatabaseSeederHostedService> logger,
    IServiceProvider serviceProvider,
    IWebHostEnvironment environment,
    IOptions<SeedOptions> seedOptions,
    IOptions<TaxonomyOptions> taxonomyOptions) : IHostedService
{
    private const string SeedItemsFolderName = "items";
    private const string SeedCollectionsFolderName = "collections";
    private const string SeederUserId = "seeder";

    private readonly ILogger<DatabaseSeederHostedService> _logger = logger;
    private readonly IServiceProvider _serviceProvider = serviceProvider;
    private readonly IWebHostEnvironment _environment = environment;
    private readonly SeedOptions _seedOptions = seedOptions.Value;
    private readonly TaxonomyOptions _taxonomyOptions = taxonomyOptions.Value;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using IServiceScope scope = _serviceProvider.CreateScope();
            ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            SeedSyncAdminService seedSyncAdminService = scope.ServiceProvider.GetRequiredService<SeedSyncAdminService>();

            await db.Database.MigrateAsync(cancellationToken);
            await SeedCategoriesAndNavigationAsync(db, cancellationToken);

            if (string.IsNullOrWhiteSpace(_seedOptions.Path))
            {
                _logger.LogWarning("Seed path is not configured. Skipping database seeding.");
                return;
            }

            string? resolvedSeedRoot = ResolveSeedPath(_seedOptions.Path);
            if (resolvedSeedRoot is null)
            {
                _logger.LogWarning("Seed path {SeedPath} does not exist. Skipping database seeding.", _seedOptions.Path);
                return;
            }

            bool hadItemsBefore = await db.Items.AnyAsync(cancellationToken);

            SeedSelection? selection = await LoadSelectionAsync(resolvedSeedRoot, cancellationToken);
            string? resolvedItemsPath = ResolveItemsPath(resolvedSeedRoot, selection);

            if (resolvedItemsPath is not null)
            {
                HashSet<Guid>? allowedIds = selection?.ItemIds?.Count > 0
                    ? [.. selection.ItemIds]
                    : null;

                List<SeedSyncAdmin.SeedItemRequest> itemRequests = await LoadSeedItemRequestsAsync(
                    resolvedItemsPath, allowedIds, cancellationToken);

                if (itemRequests.Count > 0)
                {
                    SeedSyncAdmin.ManifestRequest manifest = new(
                        SeedSet: "local-seed-dev",
                        Items: itemRequests,
                        Collections: [],
                        DeltaPreviewLimit: 50);

                    SeedSyncAdmin.SourceContext sourceContext = new(
                        RepositoryOwner: "local",
                        RepositoryName: "seed-dev",
                        GitRef: "local-dev",
                        ResolvedCommitSha: "local-dev",
                        ItemsPath: resolvedItemsPath.Replace('\\', '/'),
                        SourceFileCount: Directory.GetFiles(resolvedItemsPath, "*.json", SearchOption.AllDirectories).Length,
                        CollectionsPath: string.Empty,
                        CollectionSourceFileCount: 0);

                    Result<SeedSyncAdmin.ApplyResponse> result = await seedSyncAdminService.ApplyManifestAsync(
                        manifest,
                        sourceContext,
                        cancellationToken,
                        recordHistory: false);
                    if (result.IsFailure)
                    {
                        _logger.LogError("Failed to apply local item seed sync: {Error}", result.Error?.Description ?? "Unknown error");
                        return;
                    }

                    SeedSyncAdmin.ApplyResponse response = result.Value!;
                    _logger.LogInformation(
                        "Applied local item seed sync: {Created} created, {Updated} updated, {Unchanged} unchanged from {Total} payload items.",
                        response.CreatedCount,
                        response.UpdatedCount,
                        response.UnchangedCount,
                        response.TotalItemsInPayload);
                }
            }
            else
            {
                _logger.LogInformation("No items source found under {SeedRoot}. Skipping item seeding.", resolvedSeedRoot);
            }

            await EnsureSeedScienceRatingsAsync(db, cancellationToken);

            string? resolvedCollectionsPath = ResolveSeedCollectionsPath(resolvedSeedRoot);
            if (resolvedCollectionsPath is not null)
            {
                await EnsurePublicCollectionsAsync(db, resolvedCollectionsPath, cancellationToken);
            }

            if (!hadItemsBefore)
            {
                _logger.LogInformation("Database seeding completed successfully for an empty database.");
            }
            else
            {
                _logger.LogInformation("Database seeding completed successfully with idempotent upserts.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Database seeding failed. Error: {ErrorMessage}", ex.Message);
            _logger.LogError("Stack trace: {StackTrace}", ex.StackTrace);

            if (System.Diagnostics.Debugger.IsAttached)
            {
                throw;
            }
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

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

    private async Task<SeedSelection?> LoadSelectionAsync(string resolvedSeedRoot, CancellationToken cancellationToken)
    {
        string selectionFile = Path.Combine(resolvedSeedRoot, "selection.json");
        if (!File.Exists(selectionFile))
        {
            return null;
        }

        string json = await File.ReadAllTextAsync(selectionFile, cancellationToken);
        SeedSelection? selection = JsonSerializer.Deserialize<SeedSelection>(
            json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (selection is not null)
        {
            _logger.LogInformation(
                "Loaded selection.json: {ItemCount} item IDs, itemsSource={ItemsSource}",
                selection.ItemIds?.Count ?? 0,
                selection.ItemsSource ?? "(none)");
        }

        return selection;
    }

    private string? ResolveItemsPath(string resolvedSeedRoot, SeedSelection? selection)
    {
        // If selection.json specifies an itemsSource path, resolve it the same way
        // ResolveSeedPath does — first relative to the seed root, then walking up the tree.
        if (!string.IsNullOrWhiteSpace(selection?.ItemsSource))
        {
            string? resolved = ResolveSeedPath(selection.ItemsSource);
            if (resolved is not null)
            {
                return resolved;
            }

            _logger.LogWarning(
                "selection.json itemsSource '{ItemsSource}' could not be resolved. Falling back to local items folder.",
                selection.ItemsSource);
        }

        // Fall back to a local items/ subfolder inside the seed root.
        return ResolveSeedItemsPath(resolvedSeedRoot);
    }

    private async Task<List<SeedSyncAdmin.SeedItemRequest>> LoadSeedItemRequestsAsync(
        string resolvedItemsPath,
        HashSet<Guid>? allowedIds,
        CancellationToken cancellationToken)
    {
        string[] allFiles = Directory.GetFiles(resolvedItemsPath, "*.json", SearchOption.AllDirectories);
        Array.Sort(allFiles, StringComparer.OrdinalIgnoreCase);

        List<SeedSyncAdmin.SeedItemRequest> requests = [];
        foreach (string jsonFile in allFiles)
        {
            string fileJson = await File.ReadAllTextAsync(jsonFile, cancellationToken);
            List<RepoManagedItemSeedData>? items = JsonSerializer.Deserialize<List<RepoManagedItemSeedData>>(
                fileJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (items is null || items.Count == 0)
            {
                _logger.LogWarning("No items found in {FileName}", Path.GetFileName(jsonFile));
                continue;
            }

            foreach (RepoManagedItemSeedData item in items)
            {
                if (allowedIds is not null && !allowedIds.Contains(item.ItemId))
                {
                    continue;
                }

                requests.Add(new SeedSyncAdmin.SeedItemRequest(
                    item.ItemId,
                    item.Category,
                    item.NavigationKeyword1,
                    item.NavigationKeyword2,
                    item.Question,
                    item.CorrectAnswer,
                    item.IncorrectAnswers,
                    item.Explanation,
                    item.Keywords,
                    item.Source));
            }
        }

        return requests;
    }

    private async Task EnsureSeedScienceRatingsAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        Category? scienceCategory = await db.Categories
            .Where(category => category.Name.ToLower() == "science")
            .OrderBy(category => category.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (scienceCategory is null)
        {
            _logger.LogInformation("Science category not found. Skipping rating seeding.");
            return;
        }

        List<Guid> scienceItemIds = await db.Items
            .Where(item => item.CategoryId == scienceCategory.Id)
            .Select(item => item.Id)
            .ToListAsync(cancellationToken);

        if (scienceItemIds.Count == 0)
        {
            _logger.LogInformation("No Science items found. Skipping rating seeding.");
            return;
        }

        HashSet<Guid> existingRatedItemIds = (await db.Ratings
            .Where(rating => rating.CreatedBy == SeederUserId && scienceItemIds.Contains(rating.ItemId))
            .Select(rating => rating.ItemId)
            .ToListAsync(cancellationToken))
            .ToHashSet();

        List<Rating> ratingsToAdd = scienceItemIds
            .Where(itemId => !existingRatedItemIds.Contains(itemId))
            .Select(itemId => new Rating
            {
                ItemId = itemId,
                Stars = 5,
                CreatedBy = SeederUserId,
                CreatedAt = DateTime.UtcNow
            })
            .ToList();

        if (ratingsToAdd.Count == 0)
        {
            return;
        }

        await db.Ratings.AddRangeAsync(ratingsToAdd, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Ensured {Count} seeder ratings (5 stars) for Science items.", ratingsToAdd.Count);
    }

    private async Task EnsurePublicCollectionsAsync(
        ApplicationDbContext db,
        string resolvedCollectionsPath,
        CancellationToken cancellationToken)
    {
        string[] allFiles = Directory.GetFiles(resolvedCollectionsPath, "*.json", SearchOption.AllDirectories);
        Array.Sort(allFiles, StringComparer.OrdinalIgnoreCase);

        foreach (string jsonFile in allFiles)
        {
            string raw = await File.ReadAllTextAsync(jsonFile, cancellationToken);
            PublicCollectionSeedData? seedData = JsonSerializer.Deserialize<PublicCollectionSeedData>(
                raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (seedData is null)
            {
                _logger.LogWarning("Collection seed file {FileName} was empty.", Path.GetFileName(jsonFile));
                continue;
            }

            List<Guid> desiredItemIds = seedData.ItemIds.Distinct().ToList();
            if (desiredItemIds.Count == 0)
            {
                _logger.LogWarning("Collection seed file {FileName} had no itemIds.", Path.GetFileName(jsonFile));
                continue;
            }

            HashSet<Guid> existingItemIds = (await db.Items
                .Where(item => desiredItemIds.Contains(item.Id))
                .Select(item => item.Id)
                .ToListAsync(cancellationToken))
                .ToHashSet();

            List<Guid> missingItemIds = desiredItemIds
                .Where(itemId => !existingItemIds.Contains(itemId))
                .ToList();

            if (missingItemIds.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Collection seed '{jsonFile}' references missing itemIds: {string.Join(", ", missingItemIds)}");
            }

            Collection? collection = await db.Collections
                .FirstOrDefaultAsync(existing => existing.Id == seedData.CollectionId, cancellationToken);

            if (collection is null)
            {
                collection = new Collection
                {
                    Id = seedData.CollectionId,
                    IsRepoManaged = true,
                    Name = seedData.Name,
                    Description = seedData.Description,
                    CreatedBy = SeederUserId,
                    CreatedAt = DateTime.UtcNow,
                    IsPublic = true
                };
                await db.Collections.AddAsync(collection, cancellationToken);
            }
            else
            {
                if (!collection.IsRepoManaged)
                {
                    throw new InvalidOperationException(
                        $"Collection seed '{jsonFile}' conflicts with an existing non-repo-managed collection '{collection.Id}'.");
                }

                collection.Name = seedData.Name;
                collection.Description = seedData.Description;
                collection.IsPublic = true;
                collection.IsRepoManaged = true;
                collection.UpdatedAt = DateTime.UtcNow;
            }

            List<CollectionItem> existingLinks = await db.CollectionItems
                .Where(link => link.CollectionId == seedData.CollectionId)
                .ToListAsync(cancellationToken);

            HashSet<Guid> desiredItemSet = desiredItemIds.ToHashSet();
            List<CollectionItem> linksToRemove = existingLinks
                .Where(link => !desiredItemSet.Contains(link.ItemId))
                .ToList();

            if (linksToRemove.Count > 0)
            {
                db.CollectionItems.RemoveRange(linksToRemove);
            }

            HashSet<Guid> existingLinkItemIds = existingLinks
                .Select(link => link.ItemId)
                .ToHashSet();

            List<CollectionItem> linksToAdd = desiredItemIds
                .Where(itemId => !existingLinkItemIds.Contains(itemId))
                .Select(itemId => new CollectionItem
                {
                    CollectionId = seedData.CollectionId,
                    ItemId = itemId,
                    AddedAt = DateTime.UtcNow
                })
                .ToList();

            if (linksToAdd.Count > 0)
            {
                await db.CollectionItems.AddRangeAsync(linksToAdd, cancellationToken);
            }

            await db.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Ensured public collection {CollectionId} with {ItemCount} items from {FileName}.",
                seedData.CollectionId,
                desiredItemIds.Count,
                Path.GetFileName(jsonFile));
        }
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
        DbConnection connection = db.Database.GetDbConnection();
        bool shouldClose = connection.State != ConnectionState.Open;
        if (shouldClose)
        {
            await db.Database.OpenConnectionAsync(cancellationToken);
        }

        try
        {
            await using DbTransaction transaction = await connection.BeginTransactionAsync(cancellationToken);
            await using DbCommand command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = sql;
            await command.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        finally
        {
            if (shouldClose)
            {
                await db.Database.CloseConnectionAsync();
            }
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

    private static string? ResolveSeedCollectionsPath(string resolvedSeedRoot)
    {
        string candidate = Path.Combine(resolvedSeedRoot, SeedCollectionsFolderName);
        return Directory.Exists(candidate) ? candidate : null;
    }
}

internal sealed class SeedSelection
{
    public int SchemaVersion { get; set; }

    [JsonPropertyName("itemsSource")]
    public string? ItemsSource { get; set; }

    [JsonPropertyName("itemIds")]
    public List<Guid> ItemIds { get; set; } = [];

    [JsonPropertyName("collectionIds")]
    public List<Guid> CollectionIds { get; set; } = [];
}

internal sealed class RepoManagedItemSeedData
{
    [JsonPropertyName("itemId")]
    public Guid ItemId { get; set; }

    public string Category { get; set; } = string.Empty;
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = [];
    public string? Explanation { get; set; }
    public List<string>? Keywords { get; set; }
    public string? Source { get; set; }

    [JsonPropertyName("navigationKeyword1")]
    public string NavigationKeyword1 { get; set; } = string.Empty;

    [JsonPropertyName("navigationKeyword2")]
    public string NavigationKeyword2 { get; set; } = string.Empty;
}

internal sealed class PublicCollectionSeedData
{
    [JsonPropertyName("collectionId")]
    public Guid CollectionId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    [JsonPropertyName("itemIds")]
    public List<Guid> ItemIds { get; set; } = [];
}
