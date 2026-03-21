using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
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
        ICategoryResolver categoryResolver,
        IProfanityFilterService profanityFilter,
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
            
            // Compute fuzzy signature only from the question (normalized to lowercase)
            string questionText = request.Question.Trim().ToLowerInvariant();
            string fuzzySignature = simHashService.ComputeSimHash(questionText);
            int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required for item creation");
            
            // Resolve category via CategoryResolver
            Result<Category> categoryResult = await categoryResolver.ResolveOrCreateAsync(
                request.Category,
                isPrivate: effectiveIsPrivate,
                currentUserId: userId,
                isAdmin: userContext.IsAdmin,
                cancellationToken);

            if (categoryResult.IsFailure)
            {
                return Result.Failure<AddItem.Response>(categoryResult.Error!);
            }

            Category category = categoryResult.Value!;

            // Validate navigation and item keywords for profanity
            if (profanityFilter.ContainsProfanity(request.NavigationKeyword1))
                return Result.Failure<AddItem.Response>(Error.Validation("Item.InvalidNavigationKeyword1", "Primary topic was rejected by content filter."));
            if (profanityFilter.ContainsProfanity(request.NavigationKeyword2))
                return Result.Failure<AddItem.Response>(Error.Validation("Item.InvalidNavigationKeyword2", "Subtopic was rejected by content filter."));
            if (request.Keywords != null)
            {
                foreach (var kw in request.Keywords)
                {
                    if (!string.IsNullOrWhiteSpace(kw.Name) && profanityFilter.ContainsProfanity(kw.Name))
                        return Result.Failure<AddItem.Response>(Error.Validation("Item.InvalidKeyword", $"Keyword '{kw.Name}' was rejected by content filter."));
                }
            }

            // Resolve navigation keywords (rank-1 and rank-2) via KeywordRelation for this category (only visible relations)
            string nav1 = request.NavigationKeyword1.Trim().ToLowerInvariant();
            string nav2 = request.NavigationKeyword2.Trim().ToLowerInvariant();
            IQueryable<KeywordRelation> nav1Query = db.KeywordRelations
                .Include(kr => kr.ChildKeyword)
                .Where(kr => kr.CategoryId == category.Id && kr.ParentKeywordId == null && kr.ChildKeyword.Name.ToLower() == nav1);
            nav1Query = nav1Query.Where(kr => !kr.IsPrivate || kr.CreatedBy == userId);
            Guid? nav1Id = await nav1Query.Select(kr => kr.ChildKeywordId).FirstOrDefaultAsync(cancellationToken);
            if (nav1Id == default)
                return Result.Failure<AddItem.Response>(Error.Validation("Item.InvalidNavigationKeyword1", $"'{request.NavigationKeyword1}' is not a valid primary topic for category '{category.Name}'."));

            IQueryable<KeywordRelation> nav2Query = db.KeywordRelations
                .Include(kr => kr.ChildKeyword)
                .Where(kr => kr.CategoryId == category.Id && kr.ParentKeywordId == nav1Id && kr.ChildKeyword.Name.ToLower() == nav2);
            nav2Query = nav2Query.Where(kr => !kr.IsPrivate || kr.CreatedBy == userId);
            Guid? nav2Id = await nav2Query.Select(kr => kr.ChildKeywordId).FirstOrDefaultAsync(cancellationToken);
            if (nav2Id == default)
                return Result.Failure<AddItem.Response>(Error.Validation("Item.InvalidNavigationKeyword2", $"'{request.NavigationKeyword2}' is not a valid subtopic under '{request.NavigationKeyword1}' for category '{category.Name}'."));

            // Check for duplicates - only for the same user
            // Different users can add the same items
            // Check using CategoryId
            List<Item> candidateItems = await db.Items
                .Where(item => 
                    item.CreatedBy == userId &&
                    item.FuzzyBucket == fuzzyBucket &&
                    item.CategoryId == category.Id)
                .ToListAsync(cancellationToken);
            
            // Compare using category ID and question
            bool isDuplicate = candidateItems.Any(item =>
                (string.Equals(item.Question, request.Question, StringComparison.OrdinalIgnoreCase) ||
                 item.FuzzySignature == fuzzySignature));
            
            if (isDuplicate)
            {
                return Result.Failure<AddItem.Response>(
                    Error.Validation("Item.Duplicate", $"An item with the same question already exists in category '{category.Name}'. Questions are compared case-insensitively."));
            }

            Item item = new Item
            {
                Id = Guid.NewGuid(),
                IsPrivate = effectiveIsPrivate,
                Question = request.Question,
                CorrectAnswer = request.CorrectAnswer,
                IncorrectAnswers = request.IncorrectAnswers,
                Explanation = request.Explanation,
                FuzzySignature = fuzzySignature,
                FuzzyBucket = fuzzyBucket,
                CreatedBy = userId,
                CreatedAt = DateTime.UtcNow,
                ReadyForReview = request.ReadyForReview,
                CategoryId = category.Id,
                NavigationKeywordId1 = nav1Id,
                NavigationKeywordId2 = nav2Id,
                Source = string.IsNullOrWhiteSpace(request.Source) ? null : request.Source.Trim(),
                FactualRisk = request.FactualRisk is >= 0m and <= 1m ? request.FactualRisk : null,
                ReviewComments = string.IsNullOrWhiteSpace(request.ReviewComments) ? null : request.ReviewComments.Trim()
            };

            db.Items.Add(item);
            await db.SaveChangesAsync(cancellationToken);

            // Ensure nav keywords are in the list so we create ItemKeywords for them
            List<AddItem.KeywordRequest>? keywordsForItem = effectiveKeywords?.ToList() ?? new List<AddItem.KeywordRequest>();
            if (!keywordsForItem.Any(k => k.Name.Trim().Equals(request.NavigationKeyword1, StringComparison.OrdinalIgnoreCase)))
                keywordsForItem.Insert(0, new AddItem.KeywordRequest(request.NavigationKeyword1, effectiveIsPrivate));
            if (!keywordsForItem.Any(k => k.Name.Trim().Equals(request.NavigationKeyword2, StringComparison.OrdinalIgnoreCase)))
                keywordsForItem.Add(new AddItem.KeywordRequest(request.NavigationKeyword2, effectiveIsPrivate));

            if (keywordsForItem.Count > 0)
            {
                List<ItemKeyword> itemKeywords = new();

                foreach (AddItem.KeywordRequest keywordRequest in keywordsForItem)
                {
                    // Normalize keyword name (trim and to lowercase for consistency)
                    string normalizedName = keywordRequest.Name.Trim().ToLowerInvariant();
                    if (string.IsNullOrEmpty(normalizedName))
                    {
                        continue;
                    }

                    // Find or create keyword (case-insensitive lookup to avoid duplicates)
                    Keyword? keyword = null;
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
                        keyword = new Keyword
                        {
                            Id = Guid.NewGuid(),
                            Name = normalizedName,
                            IsPrivate = keywordRequest.IsPrivate,
                            CreatedBy = userId,
                            CreatedAt = DateTime.UtcNow,
                            IsReviewPending = keywordRequest.IsPrivate
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

                db.ItemKeywords.AddRange(itemKeywords);
                await db.SaveChangesAsync(cancellationToken);
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
                category.Name,
                item.IsPrivate,
                item.Question,
                item.CorrectAnswer,
                item.IncorrectAnswers,
                item.Explanation,
                item.CreatedAt,
                item.Source,
                item.UploadId?.ToString(),
                item.FactualRisk,
                item.ReviewComments);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<AddItem.Response>(
                Error.Problem("Item.CreateFailed", $"Failed to create item: {ex.Message}"));
        }
    }
}

