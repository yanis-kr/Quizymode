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

