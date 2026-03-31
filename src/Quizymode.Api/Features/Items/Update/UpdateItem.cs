using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Update;

public static class UpdateItem
{
    public sealed record KeywordRequest(
        string Name,
        bool IsPrivate);

    public sealed record Request(
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        bool IsPrivate,
        List<KeywordRequest>? Keywords = null,
        bool? ReadyForReview = null,
        string? Source = null);

    public sealed record Response(
        string Id,
        string Category,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt,
        string? Source);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Category)
                .NotEmpty()
                .WithMessage("Category is required");

            RuleFor(x => x.NavigationKeyword1)
                .NotEmpty()
                .WithMessage("NavigationKeyword1 (primary topic) is required")
                .MaximumLength(30)
                .WithMessage("NavigationKeyword1 must not exceed 30 characters");

            RuleFor(x => x.NavigationKeyword2)
                .NotEmpty()
                .WithMessage("NavigationKeyword2 (subtopic) is required")
                .MaximumLength(30)
                .WithMessage("NavigationKeyword2 must not exceed 30 characters");

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
                .MaximumLength(4000)
                .WithMessage("Explanation must not exceed 4000 characters");

            RuleFor(x => x.Keywords)
                .Must(keywords => keywords is null || keywords.Count <= 50)
                .WithMessage("Cannot assign more than 50 keywords to an item")
                .ForEach(rule => rule
                    .SetValidator(new KeywordRequestValidator()));

            RuleFor(x => x.Source)
                .MaximumLength(200)
                .WithMessage("Source must not exceed 200 characters");

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
            app.MapPut("items/{id}", Handler)
                .WithTags("Items")
                .WithSummary("Update an existing quiz item")
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            string id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            ISimHashService simHashService,
            IUserContext userContext,
            IAuditService auditService,
            ITaxonomyItemCategoryResolver itemCategoryResolver,
            ITaxonomyRegistry taxonomyRegistry,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(
                id,
                request,
                db,
                simHashService,
                userContext,
                auditService,
                itemCategoryResolver,
                taxonomyRegistry,
                cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Type == ErrorType.NotFound
                    ? Results.NotFound()
                    : CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        string id,
        Request request,
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
            if (!Guid.TryParse(id, out Guid itemId))
            {
                return Result.Failure<Response>(
                    Error.Validation("Item.InvalidId", "Invalid item ID format"));
            }

            Item? item = await db.Items
                .FirstOrDefaultAsync(i => i.Id == itemId, cancellationToken);

            if (item is null)
            {
                return Result.Failure<Response>(
                    Error.NotFound("Item.NotFound", $"Item with id {id} not found"));
            }

            string questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
            string fuzzySignature = simHashService.ComputeSimHash(questionText);
            int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

            bool effectiveIsPrivate = userContext.IsAdmin ? request.IsPrivate : true;

            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required for item update");

            Result<Category> categoryResult = await itemCategoryResolver.ResolveForItemAsync(
                request.Category,
                cancellationToken);

            if (categoryResult.IsFailure)
            {
                return Result.Failure<Response>(categoryResult.Error!);
            }

            Category category = categoryResult.Value!;

            string nav1Norm = KeywordHelper.NormalizeKeywordName(request.NavigationKeyword1);
            string nav2Norm = KeywordHelper.NormalizeKeywordName(request.NavigationKeyword2);

            if (request.Keywords is not null)
            {
                foreach (KeywordRequest kw in request.Keywords)
                {
                    if (string.IsNullOrWhiteSpace(kw.Name))
                        continue;
                    string n = KeywordHelper.NormalizeKeywordName(kw.Name);
                    if (string.IsNullOrEmpty(n))
                        continue;
                    if (!KeywordHelper.IsValidKeywordNameFormat(n))
                    {
                        return Result.Failure<Response>(
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
                return Result.Failure<Response>(navResult.Error!);

            (Keyword navK1, Keyword navK2) = navResult.Value!;

            // Update item properties
            item.Question = request.Question;
            item.CorrectAnswer = request.CorrectAnswer;
            item.IncorrectAnswers = request.IncorrectAnswers;
            item.Explanation = request.Explanation;
            item.IsPrivate = effectiveIsPrivate;
            item.CategoryId = category.Id;
            item.NavigationKeywordId1 = navK1.Id;
            item.NavigationKeywordId2 = navK2.Id;
            if (request.ReadyForReview.HasValue)
            {
                item.ReadyForReview = request.ReadyForReview.Value;
            }
            item.FuzzySignature = fuzzySignature;
            item.FuzzyBucket = fuzzyBucket;
            if (request.Source is not null)
            {
                item.Source = string.IsNullOrWhiteSpace(request.Source) ? null : request.Source.Trim();
            }

            if (request.Keywords is not null)
            {
                List<ItemKeyword> existingItemKeywords = await db.ItemKeywords
                    .Where(ik => ik.ItemId == itemId)
                    .ToListAsync(cancellationToken);
                db.ItemKeywords.RemoveRange(existingItemKeywords);
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
                foreach (KeywordRequest kw in request.Keywords)
                    AddUniqueName(kw.Name);

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
                        ItemId = itemId,
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

            await db.SaveChangesAsync(cancellationToken);

            // Log audit entry
            if (!string.IsNullOrEmpty(userId) && Guid.TryParse(userId, out Guid userIdGuid))
            {
                await auditService.LogAsync(
                    AuditAction.ItemUpdated,
                    userId: userIdGuid,
                    entityId: itemId,
                    cancellationToken: cancellationToken);
            }

            Response response = new(
                item.Id.ToString(),
                category.Name,
                item.IsPrivate,
                item.Question,
                item.CorrectAnswer,
                item.IncorrectAnswers,
                item.Explanation,
                item.CreatedAt,
                item.Source);

            return Result.Success(response);
        }
        catch (Exception ex)
        {
            return Result.Failure<Response>(
                Error.Problem("Item.UpdateFailed", $"Failed to update item: {ex.Message}"));
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


