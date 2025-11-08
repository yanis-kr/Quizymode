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

            List<Item> itemsToInsert = new();
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

                    // Check for duplicates
                    bool isDuplicate = await db.Items
                        .AnyAsync(item => 
                            item.CategoryId == request.CategoryId &&
                            item.SubcategoryId == request.SubcategoryId &&
                            item.FuzzyBucket == fuzzyBucket &&
                            (item.Question.Equals(itemRequest.Question, StringComparison.OrdinalIgnoreCase) ||
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
                        CategoryId = request.CategoryId,
                        SubcategoryId = request.SubcategoryId,
                        Visibility = request.Visibility,
                        Question = itemRequest.Question,
                        CorrectAnswer = itemRequest.CorrectAnswer,
                        IncorrectAnswers = itemRequest.IncorrectAnswers,
                        Explanation = itemRequest.Explanation,
                        FuzzySignature = fuzzySignature,
                        FuzzyBucket = fuzzyBucket,
                        CreatedBy = "dev_user", // TODO: Get from auth context
                        CreatedAt = DateTime.UtcNow
                    };

                    itemsToInsert.Add(item);
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

