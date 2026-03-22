using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.AddBulk;

internal static class AddItemsBulkHandler
{
    public static async Task<Result<AddItemsBulk.Response>> HandleAsync(
        AddItemsBulk.Request request,
        ApplicationDbContext db,
        ISimHashService simHashService,
        IUserContext userContext,
        ITaxonomyItemCategoryResolver itemCategoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        IAuditService auditService,
        IProfanityFilterService profanityFilter,
        CancellationToken cancellationToken)
    {
        try
        {
            IDbContextTransaction? transaction = null;
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

            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required for bulk item creation");

            bool effectiveIsPrivate = userContext.IsAdmin ? request.IsPrivate : true;

            List<Item> itemsToInsert = [];
            Dictionary<int, Item> itemIndexMap = new();
            List<string> duplicateQuestions = [];
            List<AddItemsBulk.ItemError> errors = [];

            Result<Category> categoryResult = await itemCategoryResolver.ResolveForItemAsync(
                request.Category,
                cancellationToken);

            if (categoryResult.IsFailure)
            {
                return Result.Failure<AddItemsBulk.Response>(
                    Error.Validation("Items.BulkInvalidCategory", categoryResult.Error!.Description));
            }

            Category category = categoryResult.Value!;

            string normalizedKeyword1 = KeywordHelper.NormalizeKeywordName(request.Keyword1);
            string normalizedKeyword2 = KeywordHelper.NormalizeKeywordName(request.Keyword2 ?? "");

            if (profanityFilter.ContainsProfanity(normalizedKeyword1))
                return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword1", "Primary topic (Keyword1) was rejected by content filter."));
            if (!string.IsNullOrEmpty(normalizedKeyword2) && profanityFilter.ContainsProfanity(normalizedKeyword2))
                return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword2", "Subtopic (Keyword2) was rejected by content filter."));

            Result<(Keyword Nav1, Keyword Nav2)> navResult = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
                db,
                taxonomyRegistry,
                category,
                request.Keyword1,
                request.Keyword2 ?? "",
                cancellationToken);

            if (navResult.IsFailure)
            {
                return Result.Failure<AddItemsBulk.Response>(navResult.Error!);
            }

            (Keyword keyword1Entity, Keyword keyword2Entity) = navResult.Value!;

            foreach (AddItemsBulk.KeywordRequest kw in request.Keywords)
            {
                string n = KeywordHelper.NormalizeKeywordName(kw.Name);
                if (string.IsNullOrEmpty(n))
                    continue;
                if (!KeywordHelper.IsValidKeywordNameFormat(n))
                {
                    return Result.Failure<AddItemsBulk.Response>(
                        Error.Validation("Items.BulkInvalidKeyword", $"Default keyword '{n}' is invalid. Use only letters, numbers, and hyphens (max 30 characters)."));
                }

                if (profanityFilter.ContainsProfanity(n))
                    return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword", $"Default keyword '{n}' was rejected by content filter."));

                if (string.Equals(n, normalizedKeyword1, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(n, normalizedKeyword2, StringComparison.OrdinalIgnoreCase))
                    continue;
            }

            List<string> bulkDefaultExtraNames = [];
            foreach (AddItemsBulk.KeywordRequest kw in request.Keywords)
            {
                string n = KeywordHelper.NormalizeKeywordName(kw.Name);
                if (string.IsNullOrEmpty(n))
                    continue;
                if (bulkDefaultExtraNames.Any(x => string.Equals(x, n, StringComparison.OrdinalIgnoreCase)))
                    continue;
                if (string.Equals(n, keyword1Entity.Name, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(n, keyword2Entity.Name, StringComparison.OrdinalIgnoreCase))
                    continue;
                bulkDefaultExtraNames.Add(n);
            }

            for (int i = 0; i < request.Items.Count; i++)
            {
                AddItemsBulk.ItemRequest itemRequest = request.Items[i];
                try
                {
                    bool skipItem = false;
                    if (itemRequest.Keywords is { Count: > 0 })
                    {
                        foreach (var kw in itemRequest.Keywords)
                        {
                            string name = KeywordHelper.NormalizeKeywordName(kw.Name ?? string.Empty);
                            if (string.IsNullOrEmpty(name))
                                continue;
                            if (!KeywordHelper.IsValidKeywordNameFormat(name))
                            {
                                errors.Add(new AddItemsBulk.ItemError(i, itemRequest.Question, $"Keyword '{name}' is invalid. Use only letters, numbers, and hyphens (max 30 characters)."));
                                skipItem = true;
                                break;
                            }

                            if (profanityFilter.ContainsProfanity(name))
                            {
                                errors.Add(new AddItemsBulk.ItemError(i, itemRequest.Question, $"Keyword '{name}' was rejected by content filter."));
                                skipItem = true;
                                break;
                            }

                            if (string.Equals(name, keyword1Entity.Name, StringComparison.OrdinalIgnoreCase)
                                || string.Equals(name, keyword2Entity.Name, StringComparison.OrdinalIgnoreCase))
                                continue;
                        }
                    }

                    if (skipItem)
                        continue;

                    string questionText = itemRequest.Question.Trim().ToLowerInvariant();
                    string fuzzySignature = simHashService.ComputeSimHash(questionText);
                    int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

                    bool isDuplicate = false;
                    try
                    {
                        List<Guid> existingItemIds = itemsToInsert.Select(it => it.Id).ToList();

                        List<Item> candidateItems = await db.Items
                            .Where(item =>
                                item.CreatedBy == userId &&
                                item.FuzzyBucket == fuzzyBucket &&
                                item.CategoryId == category.Id &&
                                !existingItemIds.Contains(item.Id))
                            .ToListAsync(cancellationToken);

                        if (candidateItems.Count > 0)
                        {
                            isDuplicate = candidateItems.Any(item =>
                                string.Equals(item.Question, itemRequest.Question, StringComparison.OrdinalIgnoreCase) ||
                                item.FuzzySignature == fuzzySignature);
                        }
                    }
                    catch (Exception ex)
                    {
                        errors.Add(new AddItemsBulk.ItemError(
                            i,
                            itemRequest.Question,
                            $"Unable to check for duplicates: {ex.Message}"));
                        continue;
                    }

                    if (isDuplicate)
                    {
                        duplicateQuestions.Add(itemRequest.Question);
                        continue;
                    }

                    Item item = new Item
                    {
                        Id = Guid.NewGuid(),
                        IsPrivate = effectiveIsPrivate,
                        Question = itemRequest.Question,
                        CorrectAnswer = itemRequest.CorrectAnswer,
                        IncorrectAnswers = itemRequest.IncorrectAnswers,
                        Explanation = itemRequest.Explanation,
                        FuzzySignature = fuzzySignature,
                        FuzzyBucket = fuzzyBucket,
                        CreatedBy = userId,
                        CreatedAt = DateTime.UtcNow,
                        CategoryId = category.Id,
                        NavigationKeywordId1 = keyword1Entity.Id,
                        NavigationKeywordId2 = keyword2Entity.Id,
                        Source = string.IsNullOrWhiteSpace(itemRequest.Source) ? null : itemRequest.Source.Trim(),
                        UploadId = request.UploadId,
                        FactualRisk = itemRequest.FactualRisk is >= 0m and <= 1m ? itemRequest.FactualRisk : null,
                        ReviewComments = string.IsNullOrWhiteSpace(itemRequest.ReviewComments) ? null : itemRequest.ReviewComments.Trim()
                    };

                    itemsToInsert.Add(item);
                    itemIndexMap[i] = item;
                }
                catch (Exception ex)
                {
                    errors.Add(new AddItemsBulk.ItemError(i, itemRequest.Question, ex.Message));
                }
            }

            if (itemsToInsert.Any())
            {
                db.Items.AddRange(itemsToInsert);
                await db.SaveChangesAsync(cancellationToken);

                List<ItemKeyword> itemKeywordsToInsert = [];
                Dictionary<string, Keyword> keywordCache = new(StringComparer.OrdinalIgnoreCase);

                foreach (KeyValuePair<int, Item> kvp in itemIndexMap)
                {
                    int originalIndex = kvp.Key;
                    Item item = kvp.Value;
                    AddItemsBulk.ItemRequest itemRequest = request.Items[originalIndex];

                    List<string> orderedNames = [];

                    void AddUnique(string raw)
                    {
                        string n = KeywordHelper.NormalizeKeywordName(raw);
                        if (string.IsNullOrEmpty(n))
                            return;
                        if (orderedNames.Any(x => string.Equals(x, n, StringComparison.OrdinalIgnoreCase)))
                            return;
                        orderedNames.Add(n);
                    }

                    AddUnique(keyword1Entity.Name);
                    AddUnique(keyword2Entity.Name);

                    if (itemRequest.Keywords is { Count: > 0 })
                    {
                        foreach (AddItemsBulk.KeywordRequest ik in itemRequest.Keywords)
                            AddUnique(ik.Name);
                    }
                    else
                    {
                        foreach (string extra in bulkDefaultExtraNames)
                            AddUnique(extra);
                    }

                    HashSet<Guid> attached = [];

                    foreach (string normalizedName in orderedNames)
                    {
                        string cacheKey = normalizedName;
                        Keyword keyword;
                        if (string.Equals(normalizedName, keyword1Entity.Name, StringComparison.OrdinalIgnoreCase))
                            keyword = keyword1Entity;
                        else if (string.Equals(normalizedName, keyword2Entity.Name, StringComparison.OrdinalIgnoreCase))
                            keyword = keyword2Entity;
                        else if (!keywordCache.TryGetValue(cacheKey, out keyword!))
                        {
                            keyword = await ItemNavigationAndKeywordsHelper.GetOrCreateKeywordForItemAttachmentAsync(
                                db,
                                taxonomyRegistry,
                                category.Name,
                                userId,
                                normalizedName,
                                cancellationToken);
                            keywordCache[cacheKey] = keyword;
                        }

                        if (!attached.Add(keyword.Id))
                            continue;

                        itemKeywordsToInsert.Add(new ItemKeyword
                        {
                            Id = Guid.NewGuid(),
                            ItemId = item.Id,
                            KeywordId = keyword.Id,
                            AddedAt = DateTime.UtcNow
                        });
                    }
                }

                if (itemKeywordsToInsert.Count > 0)
                {
                    db.ItemKeywords.AddRange(itemKeywordsToInsert);
                    await db.SaveChangesAsync(cancellationToken);
                }

                if (!string.IsNullOrEmpty(userId) && Guid.TryParse(userId, out Guid userIdGuid))
                {
                    foreach (Item item in itemsToInsert)
                    {
                        await auditService.LogAsync(
                            AuditAction.ItemCreated,
                            userId: userIdGuid,
                            entityId: item.Id,
                            cancellationToken: cancellationToken);
                    }
                }
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            List<Guid> createdIds = itemsToInsert.Select(i => i.Id).ToList();
            AddItemsBulk.Response response = new AddItemsBulk.Response(
                request.Items.Count,
                itemsToInsert.Count,
                duplicateQuestions.Count,
                errors.Count,
                duplicateQuestions,
                errors,
                createdIds);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<AddItemsBulk.Response>(
                Error.Problem("Items.BulkCreateFailed", $"Failed to create items: {ex.Message}"));
        }
    }
}
