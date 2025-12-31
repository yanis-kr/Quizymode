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
        CancellationToken cancellationToken)
    {
        try
        {
            string questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
            string fuzzySignature = simHashService.ComputeSimHash(questionText);
            int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

            Item item = new Item
            {
                Id = Guid.NewGuid(),
                Category = request.Category,
                Subcategory = request.Subcategory,
                IsPrivate = request.IsPrivate,
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

            // Get userId once for use throughout
            string userId = userContext.UserId ?? "dev_user";

            // Handle keywords if provided
            if (request.Keywords is not null && request.Keywords.Count > 0)
            {
                List<ItemKeyword> itemKeywords = new();

                foreach (AddItem.KeywordRequest keywordRequest in request.Keywords)
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

