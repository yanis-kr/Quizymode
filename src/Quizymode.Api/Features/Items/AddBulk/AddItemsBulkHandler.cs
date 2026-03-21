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

            // Navigation: only public relations or current user's private (so they can use their own suggested links)
            List<KeywordRelation> navForCategory = await db.KeywordRelations
                .Include(kr => kr.ChildKeyword)
                .Include(kr => kr.ParentKeyword)
                .Where(kr => kr.CategoryId == category.Id && (!kr.IsPrivate || kr.CreatedBy == userId))
                .ToListAsync(cancellationToken);

            string normalizedKeyword1 = KeywordHelper.NormalizeKeywordName(request.Keyword1);
            string? normalizedKeyword2 = string.IsNullOrWhiteSpace(request.Keyword2)
                ? null
                : KeywordHelper.NormalizeKeywordName(request.Keyword2);

            // Validate nav keywords for profanity
            if (profanityFilter.ContainsProfanity(normalizedKeyword1))
                return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword1", "Primary topic (Keyword1) was rejected by content filter."));
            if (!string.IsNullOrEmpty(normalizedKeyword2) && profanityFilter.ContainsProfanity(normalizedKeyword2))
                return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword2", "Subtopic (Keyword2) was rejected by content filter."));

            async Task<Keyword> FindOrCreateKeywordAsync(string name, bool isPrivate)
            {
                string normalized = name.Trim().ToLowerInvariant();
                Keyword? existing = await db.Keywords
                    .FirstOrDefaultAsync(k =>
                        k.Name.ToLower() == normalized &&
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
                    CreatedAt = DateTime.UtcNow,
                    IsReviewPending = isPrivate
                };
                db.Keywords.Add(keyword);
                await db.SaveChangesAsync(cancellationToken);
                return keyword;
            }

            async Task EnsureRelationAsync(Category categoryEntity, Keyword keyword, Guid? parentKeywordId)
            {
                bool exists = await db.KeywordRelations.AnyAsync(kr =>
                    kr.CategoryId == categoryEntity.Id &&
                    kr.ParentKeywordId == parentKeywordId &&
                    kr.ChildKeywordId == keyword.Id,
                    cancellationToken);
                if (exists) return;
                db.KeywordRelations.Add(new KeywordRelation
                {
                    Id = Guid.NewGuid(),
                    CategoryId = categoryEntity.Id,
                    ParentKeywordId = parentKeywordId,
                    ChildKeywordId = keyword.Id,
                    SortOrder = 0,
                    IsPrivate = true,
                    CreatedBy = userId,
                    IsReviewPending = true,
                    CreatedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync(cancellationToken);
            }

            // Rank-1: relation with ParentKeywordId null
            KeywordRelation? keyword1Rel = navForCategory.FirstOrDefault(kr =>
                kr.ParentKeywordId == null && kr.ChildKeyword.Name.ToLower() == normalizedKeyword1.ToLower());
            bool keyword1AsRank2 = navForCategory.Any(kr =>
                kr.ParentKeywordId != null && kr.ChildKeyword.Name.ToLower() == normalizedKeyword1.ToLower());

            if (keyword1AsRank2)
                return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword1", "Cannot use subtopic name as primary topic (rank1) for this category."));

            Keyword keyword1Entity;
            if (keyword1Rel is null)
            {
                keyword1Entity = await FindOrCreateKeywordAsync(normalizedKeyword1, isPrivate: true);
                bool exists = await db.KeywordRelations.AnyAsync(kr =>
                    kr.CategoryId == category.Id && kr.ParentKeywordId == null && kr.ChildKeywordId == keyword1Entity.Id,
                    cancellationToken);
                if (!exists)
                {
                    db.KeywordRelations.Add(new KeywordRelation
                    {
                        Id = Guid.NewGuid(),
                        CategoryId = category.Id,
                        ParentKeywordId = null,
                        ChildKeywordId = keyword1Entity.Id,
                        SortOrder = 0,
                        IsPrivate = true,
                        CreatedBy = userId,
                        IsReviewPending = true,
                        CreatedAt = DateTime.UtcNow
                    });
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
            else
            {
                keyword1Entity = keyword1Rel.ChildKeyword;
                bool hasRelation = await db.KeywordRelations.AnyAsync(kr =>
                    kr.CategoryId == category.Id && kr.ParentKeywordId == null && kr.ChildKeywordId == keyword1Entity.Id,
                    cancellationToken);
                if (!hasRelation)
                    await EnsureRelationAsync(category, keyword1Entity, null);
            }

            Keyword? keyword2Entity = null;
            if (!string.IsNullOrEmpty(normalizedKeyword2))
            {
                KeywordRelation? keyword2Rel = navForCategory.FirstOrDefault(kr =>
                    kr.ParentKeywordId == keyword1Entity.Id && kr.ChildKeyword.Name.ToLower() == normalizedKeyword2.ToLower());
                bool keyword2AsRank1 = navForCategory.Any(kr =>
                    kr.ParentKeywordId == null && kr.ChildKeyword.Name.ToLower() == normalizedKeyword2.ToLower());

                if (keyword2AsRank1)
                    return Result.Failure<AddItemsBulk.Response>(Error.Validation("Items.BulkInvalidKeyword2", "Cannot use primary topic name as subtopic (rank2) for this category."));

                if (keyword2Rel is null)
                {
                    keyword2Entity = await FindOrCreateKeywordAsync(normalizedKeyword2, isPrivate: true);
                    bool exists = await db.KeywordRelations.AnyAsync(kr =>
                        kr.CategoryId == category.Id && kr.ParentKeywordId == keyword1Entity.Id && kr.ChildKeywordId == keyword2Entity.Id,
                        cancellationToken);
                    if (!exists)
                    {
                        db.KeywordRelations.Add(new KeywordRelation
                        {
                            Id = Guid.NewGuid(),
                            CategoryId = category.Id,
                            ParentKeywordId = keyword1Entity.Id,
                            ChildKeywordId = keyword2Entity.Id,
                            SortOrder = 0,
                            IsPrivate = true,
                            CreatedBy = userId,
                            IsReviewPending = true,
                            CreatedAt = DateTime.UtcNow
                        });
                        await db.SaveChangesAsync(cancellationToken);
                    }
                }
                else
                {
                    keyword2Entity = keyword2Rel.ChildKeyword;
                    bool hasRelation = await db.KeywordRelations.AnyAsync(kr =>
                        kr.CategoryId == category.Id && kr.ParentKeywordId == keyword1Entity.Id && kr.ChildKeywordId == keyword2Entity.Id,
                        cancellationToken);
                    if (!hasRelation)
                        await EnsureRelationAsync(category, keyword2Entity, keyword1Entity.Id);
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
                        NavigationKeywordId1 = keyword1Entity.Id,
                        NavigationKeywordId2 = keyword2Entity?.Id,
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
                    
                    List<AddItemsBulk.KeywordRequest>? keywordsToProcess = itemRequest.Keywords;
                    if (keywordsToProcess is null || keywordsToProcess.Count == 0)
                        keywordsToProcess = defaultKeywords;
                    if (keywordsToProcess is null || keywordsToProcess.Count == 0)
                        continue;
                    
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
                            // Find or create keyword (case-insensitive lookup to avoid duplicates)
                            if (keywordRequest.IsPrivate)
                            {
                                keyword = await db.Keywords
                                    .FirstOrDefaultAsync(k => 
                                        k.Name.ToLower() == normalizedName && 
                                        k.IsPrivate == true &&
                                        k.CreatedBy == userId,
                                        cancellationToken);
                            }
                            else
                            {
                                keyword = await db.Keywords
                                    .FirstOrDefaultAsync(k => 
                                        k.Name.ToLower() == normalizedName && 
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
                                    CreatedAt = DateTime.UtcNow,
                                    IsReviewPending = keywordRequest.IsPrivate
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

