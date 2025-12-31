using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
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
                    string questionLower = itemRequest.Question.ToLower();
                    bool isDuplicate = await db.Items
                        .AnyAsync(item => 
                            item.CreatedBy == userId &&
                            item.Category == itemRequest.Category &&
                            item.Subcategory == itemRequest.Subcategory &&
                            item.FuzzyBucket == fuzzyBucket &&
                            (item.Question.ToLower() == questionLower ||
                             item.FuzzySignature == fuzzySignature),
                            cancellationToken);

                    if (isDuplicate)
                    {
                        duplicateQuestions.Add(itemRequest.Question);
                        continue;
                    }

                    Item item = new Item
                    {
                        Id = Guid.NewGuid(),
                        Category = itemRequest.Category,
                        Subcategory = itemRequest.Subcategory,
                        IsPrivate = request.IsPrivate,
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
                    
                    if (itemRequest.Keywords is null || itemRequest.Keywords.Count == 0)
                    {
                        continue;
                    }

                    foreach (AddItemsBulk.KeywordRequest keywordRequest in itemRequest.Keywords)
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

