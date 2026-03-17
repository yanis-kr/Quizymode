using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
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
        ICategoryResolver categoryResolver,
        IAuditService auditService,
        IProfanityFilterService profanityFilter,
        CancellationToken cancellationToken)
    {
        try
        {
            // Use transaction if supported, otherwise skip (for InMemory database in tests)
            IDbContextTransaction? transaction = null;
            if (db.Database.IsRelational())
            {
                try
                {
                    transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                }
                catch (NotSupportedException)
                {
                    // Some database providers don't support transactions
                    // Continue without transaction
                }
            }

            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required for bulk item creation");
            
            // Regular users can only create private items
            bool effectiveIsPrivate = userContext.IsAdmin ? request.IsPrivate : true;

            List<Item> itemsToInsert = new();
            Dictionary<int, Item> itemIndexMap = new(); // Map original index to created item
            List<string> duplicateQuestions = new();
            List<AddItemsBulk.ItemError> errors = new();

            // Resolve category from top-level request
            Result<Category> categoryResult = await categoryResolver.ResolveOrCreateAsync(
                request.Category,
                isPrivate: effectiveIsPrivate,
                currentUserId: userId,
                isAdmin: userContext.IsAdmin,
                cancellationToken);

            if (categoryResult.IsFailure)
            {
                return Result.Failure<AddItemsBulk.Response>(
                    Error.Validation("Items.BulkInvalidCategory", categoryResult.Error!.Description));
            }

            Category category = categoryResult.Value!;

            // Preload navigation keywords for this category
            List<CategoryKeyword> navForCategory = await db.CategoryKeywords
                .Include(ck => ck.Keyword)
                .Where(ck => ck.CategoryId == category.Id)
                .ToListAsync(cancellationToken);

            string normalizedKeyword1 = KeywordHelper.NormalizeKeywordName(request.Keyword1);
            string? normalizedKeyword2 = string.IsNullOrWhiteSpace(request.Keyword2)
                ? null
                : KeywordHelper.NormalizeKeywordName(request.Keyword2);

            // Helper local functions
            async Task<Keyword> FindOrCreateKeywordAsync(string name, bool isPrivate)
            {
                string normalized = name.Trim().ToLowerInvariant();
                Keyword? existing = await db.Keywords
                    .FirstOrDefaultAsync(k =>
                        k.Name == normalized &&
                        k.IsPrivate == isPrivate &&
                        (isPrivate ? k.CreatedBy == userId : true),
                        cancellationToken);

                if (existing is not null)
                    return existing;

                string slug = KeywordHelper.NameToSlug(name);
                if (string.IsNullOrEmpty(slug)) slug = normalized;

                Keyword keyword = new Keyword
                {
                    Id = Guid.NewGuid(),
                    Name = normalized,
                    Slug = slug,
                    IsPrivate = isPrivate,
                    CreatedBy = userId,
                    CreatedAt = DateTime.UtcNow
                };
                db.Keywords.Add(keyword);
                await db.SaveChangesAsync(cancellationToken);
                return keyword;
            }

            async Task EnsureSuggestionAsync(Category categoryEntity, Keyword keyword, int requestedRank, string? requestedParentName)
            {
                bool existsPending = await db.CategoryKeywordSuggestions.AnyAsync(s =>
                        s.CategoryId == categoryEntity.Id &&
                        s.KeywordId == keyword.Id &&
                        s.RequestedRank == requestedRank &&
                        s.RequestedParentName == requestedParentName &&
                        s.Status == "Pending",
                        cancellationToken);
                if (existsPending)
                    return;

                CategoryKeywordSuggestion suggestion = new CategoryKeywordSuggestion
                {
                    Id = Guid.NewGuid(),
                    CategoryId = categoryEntity.Id,
                    KeywordId = keyword.Id,
                    RequestedRank = requestedRank,
                    RequestedParentName = requestedParentName,
                    RequestedBy = userId,
                    RequestedAt = DateTime.UtcNow,
                    Status = "Pending"
                };
                db.CategoryKeywordSuggestions.Add(suggestion);
                await db.SaveChangesAsync(cancellationToken);
            }

            // Handle keyword1 (primary topic)
            Keyword keyword1Entity;
            CategoryKeyword? keyword1Nav = navForCategory
                .FirstOrDefault(ck =>
                    ck.Keyword.Name.ToLower() == normalizedKeyword1.ToLower() &&
                    ck.NavigationRank == 1);

            CategoryKeyword? keyword1AsRank2 = navForCategory
                .FirstOrDefault(ck =>
                    ck.Keyword.Name.ToLower() == normalizedKeyword1.ToLower() &&
                    ck.NavigationRank == 2);

            Keyword? existingKeyword1 = await db.Keywords
                .FirstOrDefaultAsync(k => k.Name == normalizedKeyword1.ToLower(), cancellationToken);

            if (keyword1AsRank2 is not null)
            {
                return Result.Failure<AddItemsBulk.Response>(
                    Error.Validation("Items.BulkInvalidKeyword1", "Cannot use subtopic name as primary topic (rank1) for this category."));
            }

            if (keyword1Nav is null && existingKeyword1 is null)
            {
                // Case: keyword1 not in keyword list at all -> create private + rank1 navigation
                keyword1Entity = await FindOrCreateKeywordAsync(normalizedKeyword1, isPrivate: true);

                CategoryKeyword newNav = new CategoryKeyword
                {
                    Id = Guid.NewGuid(),
                    CategoryId = category.Id,
                    KeywordId = keyword1Entity.Id,
                    NavigationRank = 1,
                    ParentName = null,
                    SortRank = 0,
                    CreatedAt = DateTime.UtcNow
                };
                db.CategoryKeywords.Add(newNav);
                await db.SaveChangesAsync(cancellationToken);
                navForCategory.Add(newNav);
            }
            else
            {
                keyword1Entity = existingKeyword1 ?? keyword1Nav!.Keyword;

                if (keyword1Nav is null)
                {
                    // Exists as keyword but not navigation -> create suggestion
                    await EnsureSuggestionAsync(category, keyword1Entity, requestedRank: 1, requestedParentName: null);
                }
            }

            // Handle keyword2 (subtopic), if provided
            Keyword? keyword2Entity = null;
            if (!string.IsNullOrEmpty(normalizedKeyword2))
            {
                CategoryKeyword? keyword2Nav = navForCategory
                    .FirstOrDefault(ck =>
                        ck.Keyword.Name.ToLower() == normalizedKeyword2.ToLower() &&
                        ck.NavigationRank == 2 &&
                        ck.ParentName == keyword1Entity.Name);

                CategoryKeyword? keyword2AsRank1 = navForCategory
                    .FirstOrDefault(ck =>
                        ck.Keyword.Name.ToLower() == normalizedKeyword2.ToLower() &&
                        ck.NavigationRank == 1);

                Keyword? existingKeyword2 = await db.Keywords
                    .FirstOrDefaultAsync(k => k.Name == normalizedKeyword2.ToLower(), cancellationToken);

                if (keyword2AsRank1 is not null)
                {
                    return Result.Failure<AddItemsBulk.Response>(
                        Error.Validation("Items.BulkInvalidKeyword2", "Cannot use primary topic name as subtopic (rank2) for this category."));
                }

                if (keyword2Nav is null && existingKeyword2 is null)
                {
                    // New subtopic: create private keyword + rank2 navigation
                    keyword2Entity = await FindOrCreateKeywordAsync(normalizedKeyword2, isPrivate: true);

                    CategoryKeyword newNav2 = new CategoryKeyword
                    {
                        Id = Guid.NewGuid(),
                        CategoryId = category.Id,
                        KeywordId = keyword2Entity.Id,
                        NavigationRank = 2,
                        ParentName = keyword1Entity.Name,
                        SortRank = 0,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.CategoryKeywords.Add(newNav2);
                    await db.SaveChangesAsync(cancellationToken);
                    navForCategory.Add(newNav2);
                }
                else
                {
                    keyword2Entity = existingKeyword2 ?? keyword2Nav!.Keyword;

                    if (keyword2Nav is null)
                    {
                        // Exists as keyword but not navigation under this parent -> suggest rank2
                        await EnsureSuggestionAsync(category, keyword2Entity, requestedRank: 2, requestedParentName: keyword1Entity.Name);
                    }
                }
            }

            // Build default keyword requests: nav keywords (rank1/2) + request.Keywords
            List<AddItemsBulk.KeywordRequest> defaultKeywords = new();
            defaultKeywords.Add(new AddItemsBulk.KeywordRequest(keyword1Entity.Name, effectiveIsPrivate));
            if (keyword2Entity is not null)
            {
                defaultKeywords.Add(new AddItemsBulk.KeywordRequest(keyword2Entity.Name, effectiveIsPrivate));
            }

            foreach (AddItemsBulk.KeywordRequest kw in request.Keywords)
            {
                string normalizedName = KeywordHelper.NormalizeKeywordName(kw.Name);
                if (string.IsNullOrEmpty(normalizedName))
                    continue;

                if (!defaultKeywords.Any(k => k.Name.Equals(normalizedName, StringComparison.OrdinalIgnoreCase)))
                {
                    defaultKeywords.Add(new AddItemsBulk.KeywordRequest(normalizedName, kw.IsPrivate));
                }
            }

            for (int i = 0; i < request.Items.Count; i++)
            {
                AddItemsBulk.ItemRequest itemRequest = request.Items[i];
                try
                {
                    // Validate keyword names (format: alphanumeric + hyphen; profanity) before creating item
                    bool skipItemDueToKeyword = false;
                    if (itemRequest.Keywords is { Count: > 0 })
                    {
                        foreach (var kw in itemRequest.Keywords)
                        {
                            string name = KeywordHelper.NormalizeKeywordName(kw.Name ?? string.Empty);
                            if (string.IsNullOrEmpty(name)) continue;
                            if (!KeywordHelper.IsValidKeywordNameFormat(name))
                            {
                                errors.Add(new AddItemsBulk.ItemError(i, itemRequest.Question, $"Keyword '{name}' is invalid. Use only letters, numbers, and hyphens (max 30 characters)."));
                                skipItemDueToKeyword = true;
                                break;
                            }
                            if (profanityFilter.ContainsProfanity(name))
                            {
                                errors.Add(new AddItemsBulk.ItemError(i, itemRequest.Question, $"Keyword '{name}' was rejected by content filter."));
                                skipItemDueToKeyword = true;
                                break;
                            }
                        }
                        if (skipItemDueToKeyword)
                            continue;
                    }

                    // Compute fuzzy signature only from the question (normalized to lowercase)
                    string questionText = itemRequest.Question.Trim().ToLowerInvariant();
                    string fuzzySignature = simHashService.ComputeSimHash(questionText);
                    int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

                    // Check for duplicates - only for the same user
                    // Different users can add the same items
                    // Check using CategoryId
                    // Exclude items that are already in the current batch (itemsToInsert)
                    bool isDuplicate = false;
                    try
                    {
                        List<Guid> existingItemIds = itemsToInsert.Select(it => it.Id).ToList();
                        
                        // Get items with matching fuzzy bucket and category (potential duplicates)
                        List<Item> candidateItems = await db.Items
                            .Where(item => 
                                item.CreatedBy == userId &&
                                item.FuzzyBucket == fuzzyBucket &&
                                item.CategoryId == category.Id &&
                                !existingItemIds.Contains(item.Id))
                            .ToListAsync(cancellationToken);
                        
                        if (candidateItems.Count > 0)
                        {
                            // Check if any candidate item has the same question/fuzzy signature
                            isDuplicate = candidateItems.Any(item =>
                            {
                                bool questionMatches = string.Equals(item.Question, itemRequest.Question, StringComparison.OrdinalIgnoreCase);
                                bool fuzzyMatches = item.FuzzySignature == fuzzySignature;
                                
                                return questionMatches || fuzzyMatches;
                            });
                        }
                    }
                    catch (Exception ex)
                    {
                        // If duplicate check fails, provide user-friendly error
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

                    // Regular users can only create private items
                    // Also ensure keywords are private for regular users
                    List<AddItemsBulk.KeywordRequest>? effectiveKeywords = itemRequest.Keywords is { Count: > 0 }
                        ? itemRequest.Keywords
                        : null;
                    if (effectiveKeywords is not null && !userContext.IsAdmin)
                    {
                        // Force all keywords to be private for regular users
                        effectiveKeywords = effectiveKeywords.Select(k => new AddItemsBulk.KeywordRequest(k.Name, effectiveIsPrivate)).ToList();
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

                // Handle keywords for all items
                List<ItemKeyword> itemKeywordsToInsert = new();
                Dictionary<string, Keyword> keywordCache = new(); // Cache to avoid duplicate lookups

                foreach (KeyValuePair<int, Item> kvp in itemIndexMap)
                {
                    int originalIndex = kvp.Key;
                    Item item = kvp.Value;
                    AddItemsBulk.ItemRequest itemRequest = request.Items[originalIndex];
                    
                    // Use effective keywords (already adjusted for regular users)
                    List<AddItemsBulk.KeywordRequest>? keywordsToProcess = itemRequest.Keywords;
                    if (keywordsToProcess is null || keywordsToProcess.Count == 0)
                    {
                        continue;
                    }
                    
                    // For regular users, ensure all keywords are private
                    if (!userContext.IsAdmin)
                    {
                        keywordsToProcess = keywordsToProcess
                            .Select(k =>
                            {
                                string normalized = KeywordHelper.NormalizeKeywordName(k.Name);
                                return new AddItemsBulk.KeywordRequest(normalized, true);
                            })
                            .ToList();
                    }
                    else
                    {
                        keywordsToProcess = keywordsToProcess
                            .Select(k =>
                            {
                                string normalized = KeywordHelper.NormalizeKeywordName(k.Name);
                                return new AddItemsBulk.KeywordRequest(normalized, k.IsPrivate);
                            })
                            .ToList();
                    }

                    foreach (AddItemsBulk.KeywordRequest keywordRequest in keywordsToProcess)
                    {
                        // Normalize keyword name
                        string normalizedName = keywordRequest.Name.Trim().ToLowerInvariant();
                        if (string.IsNullOrEmpty(normalizedName))
                        {
                            continue;
                        }

                        // Create cache key
                        string cacheKey = keywordRequest.IsPrivate 
                            ? $"{normalizedName}:private:{userId}"
                            : $"{normalizedName}:global";

                        // Check cache first
                        if (!keywordCache.TryGetValue(cacheKey, out Keyword? keyword))
                        {
                            // Find or create keyword
                            if (keywordRequest.IsPrivate)
                            {
                                keyword = await db.Keywords
                                    .FirstOrDefaultAsync(k => 
                                        k.Name == normalizedName && 
                                        k.IsPrivate == true &&
                                        k.CreatedBy == userId,
                                        cancellationToken);
                            }
                            else
                            {
                                keyword = await db.Keywords
                                    .FirstOrDefaultAsync(k => 
                                        k.Name == normalizedName && 
                                        k.IsPrivate == false,
                                        cancellationToken);
                            }

                            if (keyword is null)
                            {
                                // Create new keyword: Name and Slug from input (Slug = slugified name). Admin can update Name/Slug independently later.
                                string slug = KeywordHelper.NameToSlug(keywordRequest.Name.Trim());
                                if (string.IsNullOrEmpty(slug)) slug = normalizedName;
                                keyword = new Keyword
                                {
                                    Id = Guid.NewGuid(),
                                    Name = normalizedName,
                                    Slug = slug,
                                    IsPrivate = keywordRequest.IsPrivate,
                                    CreatedBy = userId,
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
                }

                // Log audit entries for all created items
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

