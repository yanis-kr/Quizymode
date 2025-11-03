using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Add;

public class AddItemsHandler
{
    private readonly MongoDbContext _db;
    private readonly ISimHashService _simHashService;

    public AddItemsHandler(MongoDbContext db, ISimHashService simHashService)
    {
        _db = db;
        _simHashService = simHashService;
    }

    public async Task<IResult> HandleAsync(AddItemRequest request)
    {
        // Compute SimHash for duplicate detection
        var questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
        var fuzzySignature = _simHashService.ComputeSimHash(questionText);
        var fuzzyBucket = _simHashService.GetFuzzyBucket(fuzzySignature);

        var item = new ItemModel
        {
            CategoryId = request.CategoryId,
            SubcategoryId = request.SubcategoryId,
            Visibility = request.Visibility,
            Question = request.Question,
            CorrectAnswer = request.CorrectAnswer,
            IncorrectAnswers = request.IncorrectAnswers,
            Explanation = request.Explanation,
            FuzzySignature = fuzzySignature,
            FuzzyBucket = fuzzyBucket,
            CreatedBy = "dev_user", // TODO: Get from auth context
            CreatedAt = DateTime.UtcNow
        };

        await _db.Items.InsertOneAsync(item);
        return Results.Created($"/api/items/{item.Id}", item);
    }
}
