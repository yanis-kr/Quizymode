using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Services;
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
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        bool IsPrivate,
        List<KeywordRequest>? Keywords = null,
        bool? ReadyForReview = null);

    public sealed record Response(
        string Id,
        string Category,
        bool IsPrivate,
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation,
        DateTime CreatedAt);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Category)
                .NotEmpty()
                .WithMessage("Category is required");

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
                .MaximumLength(10)
                .WithMessage("Keyword name must not exceed 10 characters");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("items/{id}", Handler)
                .WithTags("Items")
                .WithSummary("Update an existing quiz item")
                .WithOpenApi()
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
            ICategoryResolver categoryResolver,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(id, request, db, simHashService, userContext, auditService, categoryResolver, cancellationToken);

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
        ICategoryResolver categoryResolver,
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

            // Regular users can only create/update private items
            // They cannot change items to global (IsPrivate = false)
            bool effectiveIsPrivate = userContext.IsAdmin ? request.IsPrivate : true;
            
            string userId = userContext.UserId ?? throw new InvalidOperationException("User ID is required for item update");
            
            // Resolve category via CategoryResolver
            Result<Category> categoryResult = await categoryResolver.ResolveOrCreateAsync(
                request.Category,
                isPrivate: effectiveIsPrivate,
                currentUserId: userId,
                isAdmin: userContext.IsAdmin,
                cancellationToken);

            if (categoryResult.IsFailure)
            {
                return Result.Failure<Response>(categoryResult.Error!);
            }

            Category category = categoryResult.Value!;
            
            // Update item properties
            item.Question = request.Question;
            item.CorrectAnswer = request.CorrectAnswer;
            item.IncorrectAnswers = request.IncorrectAnswers;
            item.Explanation = request.Explanation;
            item.IsPrivate = effectiveIsPrivate;
            item.CategoryId = category.Id;
            if (request.ReadyForReview.HasValue)
            {
                item.ReadyForReview = request.ReadyForReview.Value;
            }
            item.FuzzySignature = fuzzySignature;
            item.FuzzyBucket = fuzzyBucket;

            // Handle keywords update
            if (request.Keywords is not null)
            {
                // Remove all existing keywords for this item
                List<ItemKeyword> existingItemKeywords = await db.ItemKeywords
                    .Where(ik => ik.ItemId == itemId)
                    .ToListAsync(cancellationToken);
                db.ItemKeywords.RemoveRange(existingItemKeywords);
                await db.SaveChangesAsync(cancellationToken);

                // Regular users can only create private keywords
                List<KeywordRequest> effectiveKeywords = request.Keywords;
                if (!userContext.IsAdmin)
                {
                    // Force all keywords to be private for regular users
                    effectiveKeywords = request.Keywords.Select(k => new KeywordRequest(k.Name, true)).ToList();
                }
                
                // Add new keywords
                if (effectiveKeywords.Count > 0)
                {
                    List<ItemKeyword> itemKeywords = new();

                    foreach (KeywordRequest keywordRequest in effectiveKeywords)
                    {
                        string normalizedName = keywordRequest.Name.Trim().ToLowerInvariant();
                        if (string.IsNullOrEmpty(normalizedName))
                        {
                            continue;
                        }

                        Keyword? keyword = null;
                        if (keywordRequest.IsPrivate)
                        {
                            keyword = await db.Keywords
                                .FirstOrDefaultAsync(k => 
                                    k.Name == normalizedName && 
                                    k.IsPrivate == true &&
                                    k.CreatedBy == userId,
                                    cancellationToken);
                        }
                        else
                        {
                            keyword = await db.Keywords
                                .FirstOrDefaultAsync(k => 
                                    k.Name == normalizedName && 
                                    k.IsPrivate == false,
                                    cancellationToken);
                        }

                        if (keyword is null)
                        {
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

                        ItemKeyword itemKeyword = new ItemKeyword
                        {
                            Id = Guid.NewGuid(),
                            ItemId = itemId,
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
                item.CreatedAt);

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


