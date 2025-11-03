using FluentValidation;
using MongoDB.Driver;
using Quizymode.Api.Data;
using Quizymode.Api.Features;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Add;

public static class AddItem
{
    public sealed record Request(
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation);

    public sealed record Response(
        string Id,
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt);

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
            app.MapPost("items", Handler)
                .WithTags("Items")
                .WithSummary("Create a new quiz item")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status201Created)
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
                value => Results.Created($"/api/items/{value.Id}", value),
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
                var questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
                var fuzzySignature = simHashService.ComputeSimHash(questionText);
                var fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

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

                await db.Items.InsertOneAsync(item, cancellationToken: cancellationToken);

                var response = new Response(
                    item.Id,
                    item.CategoryId,
                    item.SubcategoryId,
                    item.Visibility,
                    item.Question,
                    item.CorrectAnswer,
                    item.IncorrectAnswers,
                    item.Explanation,
                    item.CreatedAt);

                return Result.Success(response);
            }
            catch (Exception ex)
            {
                return Result.Failure<Response>(
                    Error.Problem("Item.CreateFailed", $"Failed to create item: {ex.Message}"));
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

