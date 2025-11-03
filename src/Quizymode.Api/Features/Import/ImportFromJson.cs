using FluentValidation;
using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Import;

public static class ImportFromJson
{
    public sealed record JsonItemRequest(
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation);

    public sealed record Request(
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        List<JsonItemRequest> Items);

    public sealed record Response(
        int ImportedCount,
        int DuplicateCount,
        List<string> DuplicateQuestions);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.CategoryId)
                .NotEmpty()
                .WithMessage("CategoryId is required");

            RuleFor(x => x.SubcategoryId)
                .NotEmpty()
                .WithMessage("SubcategoryId is required");

            RuleFor(x => x.Visibility)
                .Must(v => v == "global" || v == "private")
                .WithMessage("Visibility must be either 'global' or 'private'");

            RuleFor(x => x.Items)
                .NotNull()
                .WithMessage("Items is required")
                .Must(items => items.Count > 0)
                .WithMessage("At least one item is required")
                .Must(items => items.Count <= 1000)
                .WithMessage("Cannot import more than 1000 items at once");

            RuleForEach(x => x.Items)
                .SetValidator(new JsonItemValidator());
        }
    }

    public sealed class JsonItemValidator : AbstractValidator<JsonItemRequest>
    {
        public JsonItemValidator()
        {
            RuleFor(x => x.Question)
                .NotEmpty()
                .WithMessage("Question is required")
                .MaximumLength(1000)
                .WithMessage("Question must not exceed 1000 characters");

            RuleFor(x => x.CorrectAnswer)
                .NotEmpty()
                .WithMessage("CorrectAnswer is required")
                .MaximumLength(500)
                .WithMessage("CorrectAnswer must not exceed 500 characters");

            RuleFor(x => x.IncorrectAnswers)
                .NotNull()
                .WithMessage("IncorrectAnswers is required")
                .Must(answers => answers.Count >= 0 && answers.Count <= 4)
                .WithMessage("IncorrectAnswers must have between 0 and 4 answers")
                .ForEach(rule => rule
                    .MaximumLength(500)
                    .WithMessage("Each incorrect answer must not exceed 500 characters"));

            RuleFor(x => x.Explanation)
                .MaximumLength(2000)
                .WithMessage("Explanation must not exceed 2000 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("import/json", Handler)
                .WithTags("Import")
                .WithSummary("Import quiz items from JSON format")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            MongoDbContext db,
            ISimHashService simHashService,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, simHashService, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }

        internal static async Task<Result<Response>> HandleAsync(
            Request request,
            MongoDbContext db,
            ISimHashService simHashService,
            CancellationToken cancellationToken)
        {
            try
            {
                var importedItems = new List<ItemModel>();
                var duplicateItems = new List<string>();

                foreach (var jsonItem in request.Items)
                {
                    var questionText = $"{jsonItem.Question} {jsonItem.CorrectAnswer} {string.Join(" ", jsonItem.IncorrectAnswers)}";
                    var fuzzySignature = simHashService.ComputeSimHash(questionText);
                    var fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

                    var existingItems = await db.Items
                        .Find(i => i.CategoryId == request.CategoryId &&
                                   i.SubcategoryId == request.SubcategoryId &&
                                   i.FuzzyBucket == fuzzyBucket)
                        .ToListAsync(cancellationToken);

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
                        CreatedBy = "dev_user", // TODO: Get from auth context
                        CreatedAt = DateTime.UtcNow
                    };

                    importedItems.Add(item);
                }

                if (importedItems.Any())
                {
                    await db.Items.InsertManyAsync(importedItems, cancellationToken: cancellationToken);
                }

                var response = new Response(
                    importedItems.Count,
                    duplicateItems.Count,
                    duplicateItems);

                return Result.Success(response);
            }
            catch (Exception ex)
            {
                return Result.Failure<Response>(
                    Error.Problem("Import.Failed", $"Failed to import items: {ex.Message}"));
            }
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<Request>, Validator>();
        }
    }
}

