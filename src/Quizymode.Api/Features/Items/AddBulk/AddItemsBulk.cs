using FluentValidation;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Items.AddBulk;

public static class AddItemsBulk
{
    public sealed record KeywordRequest(
        string Name,
        bool IsPrivate);

    public sealed record ItemRequest(
        string Category,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        List<KeywordRequest>? Keywords = null,
        string? Source = null);

    public sealed record Request(
        bool IsPrivate,
        List<ItemRequest> Items);

    public sealed record Response(
        int TotalRequested,
        int CreatedCount,
        int DuplicateCount,
        int FailedCount,
        List<string> DuplicateQuestions,
        List<ItemError> Errors);

    public sealed record ItemError(
        int Index,
        string Question,
        string ErrorMessage);

    public sealed class Validator : AbstractValidator<Request>
    {
        private readonly IUserContext _userContext;

        public Validator(IUserContext userContext)
        {
            _userContext = userContext;

            int maxItems = _userContext.IsAdmin ? 1000 : 100;

            RuleFor(x => x.Items)
                .NotNull()
                .WithMessage("Items is required")
                .Must(items => items.Count > 0)
                .WithMessage("At least one item is required")
                .Must(items => items.Count <= maxItems)
                .WithMessage($"Cannot create more than {maxItems} items at once");

            RuleForEach(x => x.Items)
                .SetValidator(new ItemRequestValidator());
        }
    }

    public sealed class ItemRequestValidator : AbstractValidator<ItemRequest>
    {
        public ItemRequestValidator()
        {
            RuleFor(x => x.Category)
                .NotEmpty()
                .WithMessage("Category is required")
                .MaximumLength(100)
                .WithMessage("Category must not exceed 100 characters");

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

            RuleFor(x => x.Source)
                .MaximumLength(50)
                .WithMessage("Source must not exceed 50 characters");

            RuleFor(x => x.Keywords)
                .Must(keywords => keywords is null || keywords.Count <= 50)
                .WithMessage("Cannot assign more than 50 keywords to an item")
                .ForEach(rule => rule
                    .SetValidator(new KeywordRequestValidator()));
        }
    }

    public sealed class KeywordRequestValidator : AbstractValidator<KeywordRequest>
    {
        public KeywordRequestValidator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .WithMessage("Keyword name is required")
                .MaximumLength(30)
                .WithMessage("Keyword name must not exceed 30 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("items/bulk", Handler)
                .WithTags("Items")
                .WithSummary("Create multiple items in bulk")
                .WithDescription("Creates many items in a single request. Each item specifies its own category; isPrivate applies to all items.")
                .RequireAuthorization()
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            ISimHashService simHashService,
            IUserContext userContext,
            ICategoryResolver categoryResolver,
            IAuditService auditService,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await AddItemsBulkHandler.HandleAsync(request, db, simHashService, userContext, categoryResolver, auditService, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
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

