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

            for (int i = 0; i < request.Items.Count; i++)
            {
                AddItemsBulk.ItemRequest itemRequest = request.Items[i];
                try
                {
                    string questionText = $"{itemRequest.Question} {itemRequest.CorrectAnswer} {string.Join(" ", itemRequest.IncorrectAnswers)}";
                    string fuzzySignature = simHashService.ComputeSimHash(questionText);
                    int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

                    // Check for duplicates - only for the same user
                    // Different users can add the same items
                    // Category and Subcategory comparison is case-insensitive
                    // Use ToLower() which EF Core translates to SQL LOWER() function
                    string questionLower = itemRequest.Question.ToLower();
                    string categoryLower = itemRequest.Category.ToLower();
                    string subcategoryLower = itemRequest.Subcategory.ToLower();
                    
                    // Check for duplicates using case-insensitive comparison
                    // Fetch items in the same bucket and compare in memory to avoid EF Core translation issues
                    bool isDuplicate;
                    try
                    {
                        List<Item> candidateItems = await db.Items
                            .Where(item => 
                                item.CreatedBy == userId &&
                                item.FuzzyBucket == fuzzyBucket)
                            .ToListAsync(cancellationToken);
                        
                        isDuplicate = candidateItems.Any(item =>
                            string.Equals(item.Category, itemRequest.Category, StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(item.Subcategory, itemRequest.Subcategory, StringComparison.OrdinalIgnoreCase) &&
                            (string.Equals(item.Question, itemRequest.Question, StringComparison.OrdinalIgnoreCase) ||
                             item.FuzzySignature == fuzzySignature));
                    }
                    catch (Exception)
                    {
                        // If duplicate check fails, provide user-friendly error
                        errors.Add(new AddItemsBulk.ItemError(
                            i, 
                            itemRequest.Question, 
                            $"Unable to check for duplicates. This item may already exist with different casing (Category: {itemRequest.Category}, Subcategory: {itemRequest.Subcategory}). Please check your existing items."));
                        continue;
                    }

                    if (isDuplicate)
                    {
                        duplicateQuestions.Add(itemRequest.Question);
                        continue;
                    }

                    // Regular users can only create private items
                    // Also ensure keywords are private for regular users
                    List<AddItemsBulk.KeywordRequest>? effectiveKeywords = itemRequest.Keywords;
                    if (effectiveKeywords is not null && !userContext.IsAdmin)
                    {
                        // Force all keywords to be private for regular users
                        effectiveKeywords = effectiveKeywords.Select(k => new AddItemsBulk.KeywordRequest(k.Name, effectiveIsPrivate)).ToList();
                    }

                    // Normalize category and subcategory to ensure case-insensitive consistency
                    string normalizedCategory = CategoryHelper.Normalize(itemRequest.Category);
                    string normalizedSubcategory = CategoryHelper.Normalize(itemRequest.Subcategory);

                    Item item = new Item
                    {
                        Id = Guid.NewGuid(),
                        Category = normalizedCategory,
                        Subcategory = normalizedSubcategory,
                        IsPrivate = effectiveIsPrivate,
                        Question = itemRequest.Question,
                        CorrectAnswer = itemRequest.CorrectAnswer,
                        IncorrectAnswers = itemRequest.IncorrectAnswers,
                        Explanation = itemRequest.Explanation,
                        FuzzySignature = fuzzySignature,
                        FuzzyBucket = fuzzyBucket,
                        CreatedBy = userId,
                        CreatedAt = DateTime.UtcNow
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
                        keywordsToProcess = keywordsToProcess.Select(k => new AddItemsBulk.KeywordRequest(k.Name, true)).ToList();
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
                                keyword = new Keyword
                                {
                                    Id = Guid.NewGuid(),
                                    Name = normalizedName,
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
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            AddItemsBulk.Response response = new AddItemsBulk.Response(
                request.Items.Count,
                itemsToInsert.Count,
                duplicateQuestions.Count,
                errors.Count,
                duplicateQuestions,
                errors);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<AddItemsBulk.Response>(
                Error.Problem("Items.BulkCreateFailed", $"Failed to create items: {ex.Message}"));
        }
    }
}

