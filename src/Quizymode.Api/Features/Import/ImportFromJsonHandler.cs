using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Import;

public class ImportFromJsonHandler
{
	private readonly MongoDbContext _db;
	private readonly ISimHashService _simHashService;

	public ImportFromJsonHandler(MongoDbContext db, ISimHashService simHashService)
	{
		_db = db;
		_simHashService = simHashService;
	}

	public async Task<IResult> HandleAsync(JsonImportRequest request)
	{
		var importedItems = new List<ItemModel>();
		var duplicateItems = new List<string>();

		foreach (var jsonItem in request.Items)
		{
			var questionText = $"{jsonItem.Question} {jsonItem.CorrectAnswer} {string.Join(" ", jsonItem.IncorrectAnswers)}";
			var fuzzySignature = _simHashService.ComputeSimHash(questionText);
			var fuzzyBucket = _simHashService.GetFuzzyBucket(fuzzySignature);

			var existingItems = await _db.Items
				.Find(i => i.CategoryId == request.CategoryId &&
						  i.SubcategoryId == request.SubcategoryId &&
						  i.FuzzyBucket == fuzzyBucket)
				.ToListAsync();

			var isDuplicate = existingItems.Any(existing =>
				existing.Question.Equals(jsonItem.Question, StringComparison.OrdinalIgnoreCase) ||
				existing.FuzzySignature == fuzzySignature);

			if (isDuplicate)
			{
				duplicateItems.Add(jsonItem.Question);
				continue;
			}

			var item = new ItemModel
			{
				CategoryId = request.CategoryId,
				SubcategoryId = request.SubcategoryId,
				Visibility = request.Visibility,
				Question = jsonItem.Question,
				CorrectAnswer = jsonItem.CorrectAnswer,
				IncorrectAnswers = jsonItem.IncorrectAnswers,
				Explanation = jsonItem.Explanation,
				FuzzySignature = fuzzySignature,
				FuzzyBucket = fuzzyBucket,
				CreatedBy = "dev_user",
				CreatedAt = DateTime.UtcNow
			};

			importedItems.Add(item);
		}

		if (importedItems.Any())
		{
			await _db.Items.InsertManyAsync(importedItems);
		}

		var result = new ImportResult
		{
			ImportedCount = importedItems.Count,
			DuplicateCount = duplicateItems.Count,
			DuplicateQuestions = duplicateItems
		};

		return Results.Ok(result);
	}
}

public class ImportResult
{
	public int ImportedCount { get; set; }
	public int DuplicateCount { get; set; }
	public List<string> DuplicateQuestions { get; set; } = new();
}


