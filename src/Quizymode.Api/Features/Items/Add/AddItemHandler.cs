using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Add;

internal static class AddItemHandler
{
    public static async Task<Result<AddItem.Response>> HandleAsync(
        AddItem.Request request,
        ApplicationDbContext db,
        ISimHashService simHashService,
        IUserContext userContext,
        IAuditService auditService,
        CancellationToken cancellationToken)
    {
        try
        {
            // Regular users can only create private items
            bool effectiveIsPrivate = userContext.IsAdmin ? request.IsPrivate : true;
            
            // Regular users can only create private keywords
            List<AddItem.KeywordRequest>? effectiveKeywords = request.Keywords;
            if (effectiveKeywords is not null && !userContext.IsAdmin)
            {
                // Force all keywords to be private for regular users
                effectiveKeywords = effectiveKeywords.Select(k => new AddItem.KeywordRequest(k.Name, true)).ToList();
            }
            
            string questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
            string fuzzySignature = simHashService.ComputeSimHash(questionText);
            int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

            // Normalize category and subcategory to ensure case-insensitive consistency
            string normalizedCategory = CategoryHelper.Normalize(request.Category);
            string normalizedSubcategory = CategoryHelper.Normalize(request.Subcategory);
            
            // Check for duplicates - only for the same user
            // Different users can add the same items
            string userId = userContext.UserId ?? "dev_user";
            bool isDuplicate = await db.Items
                .Where(item => 
                    item.CreatedBy == userId &&
                    item.FuzzyBucket == fuzzyBucket)
                .ToListAsync(cancellationToken)
                .ContinueWith(t => t.Result.Any(item =>
                    string.Equals(item.Category, normalizedCategory, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(item.Subcategory, normalizedSubcategory, StringComparison.OrdinalIgnoreCase) &&
                    (string.Equals(item.Question, request.Question, StringComparison.OrdinalIgnoreCase) ||
                     item.FuzzySignature == fuzzySignature)), cancellationToken);
            
            if (isDuplicate)
            {
                return Result.Failure<AddItem.Response>(
                    Error.Validation("Item.Duplicate", $"An item with the same question already exists in category '{normalizedCategory}' / subcategory '{normalizedSubcategory}'. Questions are compared case-insensitively."));
            }

            Item item = new Item
            {
                Id = Guid.NewGuid(),
                Category = normalizedCategory,
                Subcategory = normalizedSubcategory,
                IsPrivate = effectiveIsPrivate,
                Question = request.Question,
                CorrectAnswer = request.CorrectAnswer,
                IncorrectAnswers = request.IncorrectAnswers,
                Explanation = request.Explanation,
                FuzzySignature = fuzzySignature,
                FuzzyBucket = fuzzyBucket,
                CreatedBy = userContext.UserId ?? "dev_user",
                CreatedAt = DateTime.UtcNow,
                ReadyForReview = request.ReadyForReview
            };

            db.Items.Add(item);
            await db.SaveChangesAsync(cancellationToken);

            // Handle keywords if provided
            if (effectiveKeywords is not null && effectiveKeywords.Count > 0)
            {
                List<ItemKeyword> itemKeywords = new();

                foreach (AddItem.KeywordRequest keywordRequest in effectiveKeywords)
                {
                    // Normalize keyword name (trim and to lowercase for consistency)
                    string normalizedName = keywordRequest.Name.Trim().ToLowerInvariant();
                    if (string.IsNullOrEmpty(normalizedName))
                    {
                        continue;
                    }

                    // Find or create keyword
                    Keyword? keyword = null;
                    if (keywordRequest.IsPrivate)
                    {
                        // Private keyword: must match name, IsPrivate=true, and CreatedBy
                        keyword = await db.Keywords
                            .FirstOrDefaultAsync(k => 
                                k.Name == normalizedName && 
                                k.IsPrivate == true &&
                                k.CreatedBy == userId,
                                cancellationToken);
                    }
                    else
                    {
                        // Global keyword: must match name and IsPrivate=false (CreatedBy doesn't matter)
                        keyword = await db.Keywords
                            .FirstOrDefaultAsync(k => 
                                k.Name == normalizedName && 
                                k.IsPrivate == false,
                                cancellationToken);
                    }

                    if (keyword is null)
                    {
                        // Create new keyword
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

                    // Create ItemKeyword relationship
                    ItemKeyword itemKeyword = new ItemKeyword
                    {
                        Id = Guid.NewGuid(),
                        ItemId = item.Id,
                        KeywordId = keyword.Id,
                        AddedAt = DateTime.UtcNow
                    };
                    itemKeywords.Add(itemKeyword);
                }

                if (itemKeywords.Count > 0)
                {
                    db.ItemKeywords.AddRange(itemKeywords);
                    await db.SaveChangesAsync(cancellationToken);
                }
            }

            // Log audit entry
            if (!string.IsNullOrEmpty(userId) && Guid.TryParse(userId, out Guid userIdGuid))
            {
                await auditService.LogAsync(
                    AuditAction.ItemCreated,
                    userId: userIdGuid,
                    entityId: item.Id,
                    cancellationToken: cancellationToken);
            }

            AddItem.Response response = new AddItem.Response(
                item.Id.ToString(),
                item.Category,
                item.Subcategory,
                item.IsPrivate,
                item.Question,
                item.CorrectAnswer,
                item.IncorrectAnswers,
                item.Explanation,
                item.CreatedAt);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<AddItem.Response>(
                Error.Problem("Item.CreateFailed", $"Failed to create item: {ex.Message}"));
        }
    }
}

