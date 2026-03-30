using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

internal sealed class SeedSyncAdminService(
    ApplicationDbContext db,
    ITaxonomyRegistry taxonomyRegistry)
{
    private const string SeederUserId = "seeder";

    public async Task<Result<SeedSyncAdmin.PreviewResponse>> PreviewAsync(
        SeedSyncAdmin.Request request,
        CancellationToken cancellationToken)
    {
        try
        {
            Result<SeedSyncPlan> planResult = await BuildPlanAsync(request, cancellationToken);
            if (planResult.IsFailure)
            {
                return Result.Failure<SeedSyncAdmin.PreviewResponse>(planResult.Error!);
            }

            return Result.Success(ToPreviewResponse(planResult.Value!, request.DeltaPreviewLimit));
        }
        catch (Exception ex)
        {
            return Result.Failure<SeedSyncAdmin.PreviewResponse>(
                Error.Problem("Admin.SeedSyncPreviewFailed", $"Failed to preview seed sync: {ex.Message}"));
        }
    }

    public async Task<Result<SeedSyncAdmin.ApplyResponse>> ApplyAsync(
        SeedSyncAdmin.Request request,
        CancellationToken cancellationToken)
    {
        IDbContextTransaction? transaction = null;

        try
        {
            Result<SeedSyncPlan> planResult = await BuildPlanAsync(request, cancellationToken);
            if (planResult.IsFailure)
            {
                return Result.Failure<SeedSyncAdmin.ApplyResponse>(planResult.Error!);
            }

            SeedSyncPlan plan = planResult.Value!;
            Dictionary<string, Keyword> publicKeywordMap = await LoadOrCreatePublicKeywordsAsync(plan, cancellationToken);

            if (db.Database.IsRelational())
            {
                try
                {
                    transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                }
                catch (NotSupportedException)
                {
                }
            }

            DateTime utcNow = DateTime.UtcNow;

            foreach (PlannedSeedItemChange change in plan.Changes)
            {
                ApplyChange(change, publicKeywordMap, plan.SeedSet, utcNow);
            }

            await db.SaveChangesAsync(cancellationToken);

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            return Result.Success(ToApplyResponse(plan, request.DeltaPreviewLimit));
        }
        catch (Exception ex)
        {
            await TryRollbackAsync(transaction, cancellationToken);
            return Result.Failure<SeedSyncAdmin.ApplyResponse>(
                Error.Problem("Admin.SeedSyncApplyFailed", $"Failed to apply seed sync: {ex.Message}"));
        }
        finally
        {
            if (transaction is not null)
            {
                await transaction.DisposeAsync();
            }
        }
    }

    private async Task<Result<SeedSyncPlan>> BuildPlanAsync(
        SeedSyncAdmin.Request request,
        CancellationToken cancellationToken)
    {
        List<NormalizedSeedItem> normalizedItems = request.Items
            .Select(NormalizeItem)
            .ToList();

        Result<Dictionary<string, Category>> categoryResult = await LoadCategoriesAsync(normalizedItems, cancellationToken);
        if (categoryResult.IsFailure)
        {
            return Result.Failure<SeedSyncPlan>(categoryResult.Error!);
        }

        HashSet<Guid> incomingSeedIds = normalizedItems
            .Select(i => i.SeedId)
            .ToHashSet();

        List<Item> existingManagedItems = await db.Items
            .Where(i => i.IsSeedManaged && i.SeedSet == request.SeedSet)
            .Include(i => i.Category)
            .Include(i => i.NavigationKeyword1)
            .Include(i => i.NavigationKeyword2)
            .Include(i => i.ItemKeywords)
                .ThenInclude(ik => ik.Keyword)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        Item? missingSeedId = existingManagedItems.FirstOrDefault(i => i.SeedId is null);
        if (missingSeedId is not null)
        {
            return Result.Failure<SeedSyncPlan>(
                Error.Validation(
                    "Admin.SeedSyncInvalidExistingState",
                    $"Seed-managed item '{missingSeedId.Id}' is missing SeedId."));
        }

        bool isInitialSeed = existingManagedItems.Count == 0;
        List<Item> legacyCandidates = isInitialSeed
            ? await LoadLegacyCandidatesAsync(normalizedItems, cancellationToken)
            : [];
        Dictionary<Guid, NormalizedSeedItem> normalizedBySeedId = normalizedItems
            .ToDictionary(i => i.SeedId);

        List<Item> existingSeedIdItems = await db.Items
            .Where(i => i.SeedId.HasValue && incomingSeedIds.Contains(i.SeedId.Value))
            .Include(i => i.Category)
            .Include(i => i.NavigationKeyword1)
            .Include(i => i.NavigationKeyword2)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        Dictionary<string, Category> categoryCache = categoryResult.Value!;
        Dictionary<string, ResolvedNavigationPath> navigationCache = new(StringComparer.OrdinalIgnoreCase);
        Dictionary<Guid, Item> existingBySeedId = existingManagedItems
            .Where(i => i.SeedId.HasValue)
            .ToDictionary(i => i.SeedId!.Value);
        Dictionary<string, Queue<Item>> legacyLookup = BuildLegacyLookup(legacyCandidates);
        Dictionary<Guid, Item> legacyBySeedId = legacyCandidates
            .Where(i => i.SeedId.HasValue)
            .GroupBy(i => i.SeedId!.Value)
            .ToDictionary(g => g.Key, g => g.First());
        HashSet<Guid> usedLegacyItemIds = [];
        HashSet<Guid> matchedManagedSeedIds = [];

        foreach (Item existingSeedItem in existingSeedIdItems)
        {
            if (!existingSeedItem.SeedId.HasValue)
            {
                continue;
            }

            Guid seedId = existingSeedItem.SeedId.Value;
            if (existingBySeedId.ContainsKey(seedId))
            {
                continue;
            }

            if (existingSeedItem.IsSeedManaged)
            {
                return Result.Failure<SeedSyncPlan>(
                    Error.Validation(
                        "Admin.SeedSyncSeedIdCollision",
                        $"SeedId '{seedId}' is already assigned to seed set '{existingSeedItem.SeedSet}'."));
            }

            if (isInitialSeed
                && legacyBySeedId.TryGetValue(seedId, out Item? legacyMatchBySeedId)
                && normalizedBySeedId.TryGetValue(seedId, out NormalizedSeedItem? normalizedById)
                && CanAdoptLegacyCandidate(legacyMatchBySeedId, normalizedById))
            {
                continue;
            }

            return Result.Failure<SeedSyncPlan>(
                Error.Validation(
                    "Admin.SeedSyncSeedIdAlreadyAssigned",
                    $"SeedId '{seedId}' is already assigned to existing item '{existingSeedItem.Id}' and cannot be created again."));
        }

        List<PlannedSeedItemChange> changes = [];

        foreach (NormalizedSeedItem normalizedItem in normalizedItems)
        {
            Result<ResolvedNavigationPath> pathResult = await ResolveNavigationAsync(
                normalizedItem,
                categoryCache,
                navigationCache,
                cancellationToken);

            if (pathResult.IsFailure)
            {
                return Result.Failure<SeedSyncPlan>(pathResult.Error!);
            }

            ResolvedNavigationPath path = pathResult.Value!;

            if (existingBySeedId.TryGetValue(normalizedItem.SeedId, out Item? existingManaged))
            {
                matchedManagedSeedIds.Add(normalizedItem.SeedId);
                List<string> changedFields = existingManaged.SeedHash == normalizedItem.CanonicalHash && existingManaged.SeedHash is not null
                    ? []
                    : GetChangedFields(existingManaged, normalizedItem);

                changes.Add(new PlannedSeedItemChange(
                    normalizedItem,
                    path,
                    existingManaged,
                    changedFields.Count == 0 ? SeedSyncChangeKind.Unchanged : SeedSyncChangeKind.Update,
                    changedFields));
                continue;
            }

            if (isInitialSeed)
            {
                if (legacyBySeedId.TryGetValue(normalizedItem.SeedId, out Item? exactLegacyMatch)
                    && CanAdoptLegacyCandidate(exactLegacyMatch, normalizedItem)
                    && usedLegacyItemIds.Add(exactLegacyMatch.Id))
                {
                    List<string> changedFields = GetChangedFields(exactLegacyMatch, normalizedItem);
                    changes.Add(new PlannedSeedItemChange(
                        normalizedItem,
                        path,
                        exactLegacyMatch,
                        SeedSyncChangeKind.Adopt,
                        changedFields));
                    continue;
                }

                string legacyKey = BuildLegacyKey(normalizedItem.Category, normalizedItem.NavigationKeyword1, normalizedItem.NavigationKeyword2, normalizedItem.Question);
                if (legacyLookup.TryGetValue(legacyKey, out Queue<Item>? queue))
                {
                    Item? adoptedItem = null;
                    while (queue.Count > 0 && adoptedItem is null)
                    {
                        Item candidate = queue.Dequeue();
                        if (usedLegacyItemIds.Add(candidate.Id))
                        {
                            adoptedItem = candidate;
                        }
                    }

                    if (adoptedItem is not null)
                    {
                        List<string> changedFields = GetChangedFields(adoptedItem, normalizedItem);
                        changes.Add(new PlannedSeedItemChange(
                            normalizedItem,
                            path,
                            adoptedItem,
                            SeedSyncChangeKind.Adopt,
                            changedFields));
                        continue;
                    }
                }
            }

            changes.Add(new PlannedSeedItemChange(
                normalizedItem,
                path,
                null,
                SeedSyncChangeKind.Create,
                []));
        }

        int missingFromPayloadCount = existingManagedItems.Count - matchedManagedSeedIds.Count;

        return Result.Success(new SeedSyncPlan(
            request.SeedSet,
            isInitialSeed,
            normalizedItems.Count,
            existingManagedItems.Count,
            missingFromPayloadCount,
            changes));
    }

    private static bool CanAdoptLegacyCandidate(Item candidate, NormalizedSeedItem normalizedItem)
    {
        if (candidate.IsSeedManaged || candidate.IsPrivate || !string.Equals(candidate.CreatedBy, SeederUserId, StringComparison.Ordinal))
        {
            return false;
        }

        string candidateKey = BuildLegacyKey(
            candidate.Category?.Name ?? string.Empty,
            candidate.NavigationKeyword1?.Name ?? string.Empty,
            candidate.NavigationKeyword2?.Name ?? string.Empty,
            candidate.Question);
        string incomingKey = BuildLegacyKey(
            normalizedItem.Category,
            normalizedItem.NavigationKeyword1,
            normalizedItem.NavigationKeyword2,
            normalizedItem.Question);

        return string.Equals(candidateKey, incomingKey, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<Result<Dictionary<string, Category>>> LoadCategoriesAsync(
        List<NormalizedSeedItem> normalizedItems,
        CancellationToken cancellationToken)
    {
        HashSet<string> categoryNames = normalizedItems
            .Select(i => i.Category)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (string categoryName in categoryNames)
        {
            if (!taxonomyRegistry.HasCategory(categoryName))
            {
                return Result.Failure<Dictionary<string, Category>>(
                    Error.Validation(
                        "Admin.SeedSyncInvalidCategory",
                        $"Category '{categoryName}' is not a valid taxonomy category."));
            }
        }

        List<Category> categories = await db.Categories
            .Where(c => !c.IsPrivate && categoryNames.Contains(c.Name.ToLower()))
            .ToListAsync(cancellationToken);

        Dictionary<string, Category> categoryCache = categories
            .ToDictionary(c => c.Name.ToLower(), c => c, StringComparer.OrdinalIgnoreCase);

        string? missingCategory = categoryNames.FirstOrDefault(name => !categoryCache.ContainsKey(name));
        if (missingCategory is not null)
        {
            return Result.Failure<Dictionary<string, Category>>(
                Error.Validation(
                    "Admin.SeedSyncCategoryMissingFromDb",
                    $"Category '{missingCategory}' does not exist in the database."));
        }

        return Result.Success(categoryCache);
    }

    private async Task<List<Item>> LoadLegacyCandidatesAsync(
        List<NormalizedSeedItem> normalizedItems,
        CancellationToken cancellationToken)
    {
        HashSet<string> categoryNames = normalizedItems
            .Select(i => i.Category)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return await db.Items
            .Where(i => !i.IsSeedManaged && !i.IsPrivate && i.CreatedBy == SeederUserId)
            .Where(i => i.Category != null && categoryNames.Contains(i.Category.Name.ToLower()))
            .Include(i => i.Category)
            .Include(i => i.NavigationKeyword1)
            .Include(i => i.NavigationKeyword2)
            .Include(i => i.ItemKeywords)
                .ThenInclude(ik => ik.Keyword)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    private static Dictionary<string, Queue<Item>> BuildLegacyLookup(List<Item> legacyCandidates)
    {
        Dictionary<string, Queue<Item>> lookup = new(StringComparer.OrdinalIgnoreCase);

        foreach (Item item in legacyCandidates)
        {
            string key = BuildLegacyKey(
                item.Category?.Name ?? string.Empty,
                item.NavigationKeyword1?.Name ?? string.Empty,
                item.NavigationKeyword2?.Name ?? string.Empty,
                item.Question);

            if (!lookup.TryGetValue(key, out Queue<Item>? queue))
            {
                queue = new Queue<Item>();
                lookup[key] = queue;
            }

            queue.Enqueue(item);
        }

        return lookup;
    }

    private async Task<Result<ResolvedNavigationPath>> ResolveNavigationAsync(
        NormalizedSeedItem item,
        Dictionary<string, Category> categoryCache,
        Dictionary<string, ResolvedNavigationPath> navigationCache,
        CancellationToken cancellationToken)
    {
        string cacheKey = $"{item.Category}|{item.NavigationKeyword1}|{item.NavigationKeyword2}";
        if (navigationCache.TryGetValue(cacheKey, out ResolvedNavigationPath? cached))
        {
            return Result.Success(cached);
        }

        if (!categoryCache.TryGetValue(item.Category, out Category? category))
        {
            return Result.Failure<ResolvedNavigationPath>(
                Error.Validation(
                    "Admin.SeedSyncCategoryMissingFromDb",
                    $"Category '{item.Category}' does not exist in the database."));
        }

        Result<(Keyword Nav1, Keyword Nav2)> navResult = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
            db,
            taxonomyRegistry,
            category,
            item.NavigationKeyword1,
            item.NavigationKeyword2,
            cancellationToken);

        if (navResult.IsFailure)
        {
            return Result.Failure<ResolvedNavigationPath>(navResult.Error!);
        }

        ResolvedNavigationPath resolved = new(category, navResult.Value!.Nav1, navResult.Value!.Nav2);
        navigationCache[cacheKey] = resolved;
        return Result.Success(resolved);
    }

    private async Task<Dictionary<string, Keyword>> LoadOrCreatePublicKeywordsAsync(
        SeedSyncPlan plan,
        CancellationToken cancellationToken)
    {
        HashSet<string> requiredNames = plan.Changes
            .SelectMany(change => change.Item.Keywords)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (requiredNames.Count == 0)
        {
            return new Dictionary<string, Keyword>(StringComparer.OrdinalIgnoreCase);
        }

        List<Keyword> existing = await db.Keywords
            .Where(k => !k.IsPrivate && requiredNames.Contains(k.Name.ToLower()))
            .ToListAsync(cancellationToken);

        Dictionary<string, Keyword> map = existing
            .ToDictionary(k => k.Name.ToLower(), k => k, StringComparer.OrdinalIgnoreCase);

        foreach (string requiredName in requiredNames.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            if (map.ContainsKey(requiredName))
            {
                continue;
            }

            Keyword keyword = new()
            {
                Id = Guid.NewGuid(),
                Name = requiredName,
                Slug = KeywordHelper.NameToSlug(requiredName),
                IsPrivate = false,
                CreatedBy = SeederUserId,
                CreatedAt = DateTime.UtcNow,
                IsReviewPending = false
            };

            db.Keywords.Add(keyword);
            map[requiredName] = keyword;
        }

        return map;
    }

    private void ApplyChange(
        PlannedSeedItemChange change,
        Dictionary<string, Keyword> publicKeywordMap,
        string seedSet,
        DateTime utcNow)
    {
        Item item = change.ExistingItem ?? new Item
        {
            Id = Guid.NewGuid(),
            CreatedAt = utcNow,
            CreatedBy = SeederUserId
        };

        if (change.ExistingItem is null)
        {
            db.Items.Add(item);
        }

        item.SeedId = change.Item.SeedId;
        item.IsSeedManaged = true;
        item.SeedSet = seedSet;
        item.SeedHash = change.Item.CanonicalHash;
        item.SeedLastSyncedAt = utcNow;
        item.IsPrivate = false;
        item.Question = change.Item.Question;
        item.CorrectAnswer = change.Item.CorrectAnswer;
        item.IncorrectAnswers = change.Item.IncorrectAnswers;
        item.Explanation = change.Item.Explanation;
        item.Source = change.Item.Source;
        item.CategoryId = change.Navigation.Category.Id;
        item.NavigationKeywordId1 = change.Navigation.Nav1.Id;
        item.NavigationKeywordId2 = change.Navigation.Nav2.Id;
        item.CreatedBy = SeederUserId;

        ReconcileItemKeywords(item, change, publicKeywordMap, utcNow);
    }

    private void ReconcileItemKeywords(
        Item item,
        PlannedSeedItemChange change,
        Dictionary<string, Keyword> publicKeywordMap,
        DateTime utcNow)
    {
        item.ItemKeywords ??= [];

        HashSet<Guid> desiredKeywordIds =
        [
            change.Navigation.Nav1.Id,
            change.Navigation.Nav2.Id
        ];

        foreach (string keywordName in change.Item.Keywords)
        {
            if (publicKeywordMap.TryGetValue(keywordName, out Keyword? keyword))
            {
                desiredKeywordIds.Add(keyword.Id);
            }
        }

        List<ItemKeyword> toRemove = item.ItemKeywords
            .Where(ik => !desiredKeywordIds.Contains(ik.KeywordId))
            .ToList();

        if (toRemove.Count > 0)
        {
            db.ItemKeywords.RemoveRange(toRemove);
            foreach (ItemKeyword link in toRemove)
            {
                item.ItemKeywords.Remove(link);
            }
        }

        HashSet<Guid> existingKeywordIds = item.ItemKeywords
            .Select(ik => ik.KeywordId)
            .ToHashSet();

        foreach (Guid keywordId in desiredKeywordIds)
        {
            if (existingKeywordIds.Contains(keywordId))
            {
                continue;
            }

            ItemKeyword link = new()
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                KeywordId = keywordId,
                AddedAt = utcNow
            };

            db.ItemKeywords.Add(link);
            item.ItemKeywords.Add(link);
        }
    }

    private static SeedSyncAdmin.PreviewResponse ToPreviewResponse(
        SeedSyncPlan plan,
        int deltaPreviewLimit)
    {
        if (plan.IsInitialSeed)
        {
            return new SeedSyncAdmin.PreviewResponse(
                plan.SeedSet,
                IsInitialSeed: true,
                PreviewSuppressed: true,
                TotalItemsInPayload: plan.TotalItemsInPayload,
                ExistingManagedItemCount: plan.ExistingManagedItemCount,
                CreatedCount: plan.CreateCount,
                UpdatedCount: plan.UpdateCount,
                AdoptedCount: plan.AdoptCount,
                UnchangedCount: plan.UnchangedCount,
                MissingFromPayloadCount: plan.MissingFromPayloadCount,
                HasMoreChanges: false,
                Changes: []);
        }

        List<SeedSyncAdmin.ChangeResponse> deltaChanges = BuildDeltaChanges(plan, deltaPreviewLimit);

        return new SeedSyncAdmin.PreviewResponse(
            plan.SeedSet,
            plan.IsInitialSeed,
            PreviewSuppressed: false,
            plan.TotalItemsInPayload,
            plan.ExistingManagedItemCount,
            plan.CreateCount,
            plan.UpdateCount,
            plan.AdoptCount,
            plan.UnchangedCount,
            plan.MissingFromPayloadCount,
            HasMoreChanges: plan.DeltaChangeCount > deltaChanges.Count,
            deltaChanges);
    }

    private static SeedSyncAdmin.ApplyResponse ToApplyResponse(
        SeedSyncPlan plan,
        int deltaPreviewLimit)
    {
        List<SeedSyncAdmin.ChangeResponse> deltaChanges = plan.IsInitialSeed
            ? []
            : BuildDeltaChanges(plan, deltaPreviewLimit);

        return new SeedSyncAdmin.ApplyResponse(
            plan.SeedSet,
            plan.IsInitialSeed,
            plan.TotalItemsInPayload,
            plan.ExistingManagedItemCount,
            plan.CreateCount,
            plan.UpdateCount,
            plan.AdoptCount,
            plan.UnchangedCount,
            plan.MissingFromPayloadCount,
            HasMoreChanges: !plan.IsInitialSeed && plan.DeltaChangeCount > deltaChanges.Count,
            deltaChanges);
    }

    private static List<SeedSyncAdmin.ChangeResponse> BuildDeltaChanges(
        SeedSyncPlan plan,
        int deltaPreviewLimit)
    {
        return plan.Changes
            .Where(change => change.ChangeKind != SeedSyncChangeKind.Unchanged)
            .Take(deltaPreviewLimit)
            .Select(change => new SeedSyncAdmin.ChangeResponse(
                change.Item.SeedId,
                change.ChangeKind switch
                {
                    SeedSyncChangeKind.Create => "Created",
                    SeedSyncChangeKind.Update => "Updated",
                    SeedSyncChangeKind.Adopt => "Adopted",
                    _ => "Unchanged"
                },
                change.Item.Category,
                change.Item.NavigationKeyword1,
                change.Item.NavigationKeyword2,
                change.Item.Question,
                change.ChangedFields))
            .ToList();
    }

    private static NormalizedSeedItem NormalizeItem(SeedSyncAdmin.SeedItemRequest item)
    {
        string category = CategoryHelper.NameToSlug(item.Category);
        string nav1 = KeywordHelper.NormalizeKeywordName(item.NavigationKeyword1).ToLowerInvariant();
        string nav2 = KeywordHelper.NormalizeKeywordName(item.NavigationKeyword2).ToLowerInvariant();
        string question = item.Question.Trim();
        string correctAnswer = item.CorrectAnswer.Trim();
        List<string> incorrectAnswers = item.IncorrectAnswers.Select(x => x.Trim()).ToList();
        string explanation = (item.Explanation ?? string.Empty).Trim();
        string? source = string.IsNullOrWhiteSpace(item.Source) ? null : item.Source.Trim();
        List<string> keywords = NormalizeKeywords(item.Keywords, category, nav1, nav2);
        string canonicalHash = ComputeCanonicalHash(category, nav1, nav2, question, correctAnswer, incorrectAnswers, explanation, source, keywords);

        return new NormalizedSeedItem(
            item.SeedId,
            category,
            nav1,
            nav2,
            question,
            correctAnswer,
            incorrectAnswers,
            explanation,
            keywords,
            source,
            canonicalHash);
    }

    private static List<string> NormalizeKeywords(
        IEnumerable<string>? rawKeywords,
        string category,
        string nav1,
        string nav2)
    {
        HashSet<string> seen = new(StringComparer.OrdinalIgnoreCase);
        List<string> normalized = [];

        if (rawKeywords is null)
        {
            return normalized;
        }

        foreach (string raw in rawKeywords)
        {
            string keyword = KeywordHelper.NormalizeKeywordName(raw).ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(keyword))
            {
                continue;
            }

            if (string.Equals(keyword, category, StringComparison.OrdinalIgnoreCase)
                || string.Equals(keyword, nav1, StringComparison.OrdinalIgnoreCase)
                || string.Equals(keyword, nav2, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!seen.Add(keyword))
            {
                continue;
            }

            normalized.Add(keyword);
        }

        normalized.Sort(StringComparer.OrdinalIgnoreCase);
        return normalized;
    }

    private static string ComputeCanonicalHash(
        string category,
        string nav1,
        string nav2,
        string question,
        string correctAnswer,
        List<string> incorrectAnswers,
        string explanation,
        string? source,
        List<string> keywords)
    {
        string json = JsonSerializer.Serialize(new
        {
            category,
            navigationKeyword1 = nav1,
            navigationKeyword2 = nav2,
            question,
            correctAnswer,
            incorrectAnswers,
            explanation,
            source = source ?? string.Empty,
            keywords
        });

        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static List<string> GetChangedFields(Item existingItem, NormalizedSeedItem incoming)
    {
        ExistingSeedState existing = BuildExistingState(existingItem);
        List<string> changed = [];

        if (!string.Equals(existing.Category, incoming.Category, StringComparison.OrdinalIgnoreCase))
        {
            changed.Add("category");
        }

        if (!string.Equals(existing.NavigationKeyword1, incoming.NavigationKeyword1, StringComparison.OrdinalIgnoreCase))
        {
            changed.Add("navigationKeyword1");
        }

        if (!string.Equals(existing.NavigationKeyword2, incoming.NavigationKeyword2, StringComparison.OrdinalIgnoreCase))
        {
            changed.Add("navigationKeyword2");
        }

        if (!string.Equals(existing.Question, incoming.Question, StringComparison.Ordinal))
        {
            changed.Add("question");
        }

        if (!string.Equals(existing.CorrectAnswer, incoming.CorrectAnswer, StringComparison.Ordinal))
        {
            changed.Add("correctAnswer");
        }

        if (!existing.IncorrectAnswers.SequenceEqual(incoming.IncorrectAnswers))
        {
            changed.Add("incorrectAnswers");
        }

        if (!string.Equals(existing.Explanation, incoming.Explanation, StringComparison.Ordinal))
        {
            changed.Add("explanation");
        }

        if (!string.Equals(existing.Source ?? string.Empty, incoming.Source ?? string.Empty, StringComparison.Ordinal))
        {
            changed.Add("source");
        }

        if (!existing.Keywords.SequenceEqual(incoming.Keywords))
        {
            changed.Add("keywords");
        }

        return changed;
    }

    private static ExistingSeedState BuildExistingState(Item item)
    {
        string nav1 = item.NavigationKeyword1?.Name?.Trim().ToLowerInvariant() ?? string.Empty;
        string nav2 = item.NavigationKeyword2?.Name?.Trim().ToLowerInvariant() ?? string.Empty;

        List<string> extras = item.ItemKeywords
            .Select(ik => ik.Keyword?.Name)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!.Trim().ToLowerInvariant())
            .Where(name => !string.Equals(name, nav1, StringComparison.OrdinalIgnoreCase))
            .Where(name => !string.Equals(name, nav2, StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new ExistingSeedState(
            CategoryHelper.NameToSlug(item.Category?.Name ?? string.Empty),
            nav1,
            nav2,
            item.Question.Trim(),
            item.CorrectAnswer.Trim(),
            item.IncorrectAnswers.Select(x => x.Trim()).ToList(),
            item.Explanation.Trim(),
            string.IsNullOrWhiteSpace(item.Source) ? null : item.Source.Trim(),
            extras);
    }

    private static string BuildLegacyKey(
        string category,
        string navigationKeyword1,
        string navigationKeyword2,
        string question)
    {
        return $"{CategoryHelper.NameToSlug(category)}|{KeywordHelper.NormalizeKeywordName(navigationKeyword1).ToLowerInvariant()}|{KeywordHelper.NormalizeKeywordName(navigationKeyword2).ToLowerInvariant()}|{question.Trim().ToLowerInvariant()}";
    }

    private static async Task TryRollbackAsync(
        IDbContextTransaction? transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is null)
        {
            return;
        }

        try
        {
            await transaction.RollbackAsync(cancellationToken);
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private sealed record NormalizedSeedItem(
        Guid SeedId,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        List<string> Keywords,
        string? Source,
        string CanonicalHash);

    private sealed record ExistingSeedState(
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        string? Source,
        List<string> Keywords);

    private sealed record ResolvedNavigationPath(
        Category Category,
        Keyword Nav1,
        Keyword Nav2);

    private sealed record PlannedSeedItemChange(
        NormalizedSeedItem Item,
        ResolvedNavigationPath Navigation,
        Item? ExistingItem,
        SeedSyncChangeKind ChangeKind,
        List<string> ChangedFields);

    private sealed record SeedSyncPlan(
        string SeedSet,
        bool IsInitialSeed,
        int TotalItemsInPayload,
        int ExistingManagedItemCount,
        int MissingFromPayloadCount,
        List<PlannedSeedItemChange> Changes)
    {
        public int CreateCount => Changes.Count(change => change.ChangeKind == SeedSyncChangeKind.Create);
        public int UpdateCount => Changes.Count(change => change.ChangeKind == SeedSyncChangeKind.Update);
        public int AdoptCount => Changes.Count(change => change.ChangeKind == SeedSyncChangeKind.Adopt);
        public int UnchangedCount => Changes.Count(change => change.ChangeKind == SeedSyncChangeKind.Unchanged);
        public int DeltaChangeCount => Changes.Count(change => change.ChangeKind != SeedSyncChangeKind.Unchanged);
    }

    private enum SeedSyncChangeKind
    {
        Create,
        Update,
        Adopt,
        Unchanged
    }
}
