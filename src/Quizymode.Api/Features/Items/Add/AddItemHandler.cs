using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
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
        ITaxonomyItemCategoryResolver itemCategoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        CancellationToken cancellationToken)
    {
        try
        {
            bool effectiveIsPrivate = userContext.IsAdmin ? request.IsPrivate : true;

            string questionText = request.Question.Trim().ToLowerInvariant();
            string fuzzySignature = simHashService.ComputeSimHash(questionText);
            int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required for item creation");

            Result<Category> categoryResult = await itemCategoryResolver.ResolveForItemAsync(
                request.Category,
                cancellationToken);

            if (categoryResult.IsFailure)
            {
                return Result.Failure<AddItem.Response>(categoryResult.Error!);
            }

            Category category = categoryResult.Value!;

            string nav1Norm = KeywordHelper.NormalizeKeywordName(request.NavigationKeyword1);
            string nav2Norm = KeywordHelper.NormalizeKeywordName(request.NavigationKeyword2);

            if (request.Keywords is not null)
            {
                foreach (AddItem.KeywordRequest kw in request.Keywords)
                {
                    if (string.IsNullOrWhiteSpace(kw.Name))
                        continue;
                    string n = KeywordHelper.NormalizeKeywordName(kw.Name);
                    if (string.IsNullOrEmpty(n))
                        continue;
                    if (!KeywordHelper.IsValidKeywordNameFormat(n))
                    {
                        return Result.Failure<AddItem.Response>(
                            Error.Validation("Item.InvalidKeyword", $"Keyword '{n}' is invalid. Use only letters, numbers, and hyphens (max 30 characters)."));
                    }

                    if (string.Equals(n, nav1Norm, StringComparison.OrdinalIgnoreCase)
                        || string.Equals(n, nav2Norm, StringComparison.OrdinalIgnoreCase))
                        continue;
                }
            }

            Result<(Keyword Nav1, Keyword Nav2)> navResult = await ItemNavigationAndKeywordsHelper.ResolvePublicNavigationAsync(
                db,
                taxonomyRegistry,
                category,
                request.NavigationKeyword1,
                request.NavigationKeyword2,
                cancellationToken);

            if (navResult.IsFailure)
                return Result.Failure<AddItem.Response>(navResult.Error!);

            (Keyword navK1, Keyword navK2) = navResult.Value!;

            List<Item> candidateItems = await db.Items
                .Where(item =>
                    item.CreatedBy == userId &&
                    item.FuzzyBucket == fuzzyBucket &&
                    item.CategoryId == category.Id)
                .ToListAsync(cancellationToken);

            bool isDuplicate = candidateItems.Any(item =>
                string.Equals(item.Question, request.Question, StringComparison.OrdinalIgnoreCase) ||
                item.FuzzySignature == fuzzySignature);

            if (isDuplicate)
            {
                return Result.Failure<AddItem.Response>(
                    Error.Validation("Item.Duplicate", $"An item with the same question already exists in category '{category.Name}'. Questions are compared case-insensitively."));
            }

            Item item = new Item
            {
                Id = Guid.NewGuid(),
                IsRepoManaged = false,
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
                NavigationKeywordId1 = navK1.Id,
                NavigationKeywordId2 = navK2.Id,
                Source = string.IsNullOrWhiteSpace(request.Source) ? null : request.Source.Trim(),
            };

            db.Items.Add(item);
            await db.SaveChangesAsync(cancellationToken);

            List<string> orderedNames = [];
            void AddUniqueName(string raw)
            {
                string n = KeywordHelper.NormalizeKeywordName(raw);
                if (string.IsNullOrEmpty(n))
                    return;
                if (orderedNames.Any(x => string.Equals(x, n, StringComparison.OrdinalIgnoreCase)))
                    return;
                orderedNames.Add(n);
            }

            AddUniqueName(request.NavigationKeyword1);
            AddUniqueName(request.NavigationKeyword2);
            if (request.Keywords is not null)
            {
                foreach (AddItem.KeywordRequest kw in request.Keywords)
                    AddUniqueName(kw.Name);
            }

            if (orderedNames.Count > 0)
            {
                List<ItemKeyword> itemKeywords = [];
                HashSet<Guid> attached = [];

                foreach (string normalizedName in orderedNames)
                {
                    Keyword keyword;
                    if (string.Equals(normalizedName, navK1.Name, StringComparison.OrdinalIgnoreCase))
                        keyword = navK1;
                    else if (string.Equals(normalizedName, navK2.Name, StringComparison.OrdinalIgnoreCase))
                        keyword = navK2;
                    else
                    {
                        keyword = await ItemNavigationAndKeywordsHelper.GetOrCreateKeywordForItemAttachmentAsync(
                            db,
                            taxonomyRegistry,
                            category.Name,
                            userId,
                            normalizedName,
                            cancellationToken);
                    }

                    if (!attached.Add(keyword.Id))
                        continue;

                    itemKeywords.Add(new ItemKeyword
                    {
                        Id = Guid.NewGuid(),
                        ItemId = item.Id,
                        KeywordId = keyword.Id,
                        AddedAt = DateTime.UtcNow
                    });
                }

                if (itemKeywords.Count > 0)
                {
                    db.ItemKeywords.AddRange(itemKeywords);
                    await db.SaveChangesAsync(cancellationToken);
                }
            }

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
                item.UploadId?.ToString());

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<AddItem.Response>(
                Error.Problem("Item.CreateFailed", $"Failed to create item: {ex.Message}"));
        }
    }
}
