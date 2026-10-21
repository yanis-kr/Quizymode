using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>
/// POST /study-guide-uploads/{id}/accept: after review, create the selected generated questions as the owner's
/// private items through the standard bulk item-creation path. Items record the upload id in <c>UploadId</c>.
/// Accepting is one-time per upload.
/// </summary>
public static class AcceptStudyGuideUpload
{
    /// <summary>QuestionIndexes: zero-based indexes of the questions to keep; null or omitted keeps all.</summary>
    public sealed record Request(List<int>? QuestionIndexes);

    public sealed record Response(
        int CreatedCount,
        int DuplicateCount,
        int FailedCount,
        List<string> CreatedItemIds,
        List<string> Errors);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.QuestionIndexes)
                .Must(indexes => indexes is null || (indexes.Count > 0 && indexes.Count <= 20))
                .WithMessage("Select between 1 and 20 questions.");

            RuleForEach(x => x.QuestionIndexes)
                .InclusiveBetween(0, 19)
                .WithMessage("Question index is out of range.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("study-guide-uploads/{id:guid}/accept", Handler)
                .WithTags("StudyGuideUploads")
                .WithSummary("Accept generated questions and create them as private items")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> Handler(
            Guid id,
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            IUserContext userContext,
            ISimHashService simHashService,
            ITaxonomyItemCategoryResolver itemCategoryResolver,
            ITaxonomyRegistry taxonomyRegistry,
            IAuditService auditService,
            ILogger<Endpoint> logger,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            FluentValidation.Results.ValidationResult validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return Results.BadRequest(validation.Errors);
            }

            Result<Response?> result = await HandleAsync(
                id,
                request,
                db,
                userContext,
                simHashService,
                itemCategoryResolver,
                taxonomyRegistry,
                auditService,
                cancellationToken,
                logger);

            return result.Match(
                value => value is null ? Results.NotFound() : Results.Ok(value),
                _ => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response?>> HandleAsync(
        Guid id,
        Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        ISimHashService simHashService,
        ITaxonomyItemCategoryResolver itemCategoryResolver,
        ITaxonomyRegistry taxonomyRegistry,
        IAuditService auditService,
        CancellationToken cancellationToken,
        ILogger? logger = null)
    {
        string? userId = userContext.UserId;
        StudyGuideUpload? upload = await db.StudyGuideUploads
            .FirstOrDefaultAsync(u => u.Id == id && u.UserId == userId, cancellationToken);
        if (upload is null)
        {
            return Result.Success<Response?>(null);
        }

        if (upload.Status != StudyGuideUploadStatus.Completed)
        {
            return Result.Failure<Response?>(Error.Conflict(
                "StudyGuideUpload.NotReady",
                "Questions are not ready to add yet."));
        }

        if (upload.AcceptedUtc is not null)
        {
            return Result.Failure<Response?>(Error.Conflict(
                "StudyGuideUpload.AlreadyAccepted",
                "These questions were already added to your items."));
        }

        List<StudyGuideGeneratedQuestion> questions = GetStudyGuideUpload.ReadQuestions(upload);
        List<StudyGuideGeneratedQuestion> selected = request.QuestionIndexes is null
            ? questions
            : request.QuestionIndexes
                .Distinct()
                .Where(index => index >= 0 && index < questions.Count)
                .OrderBy(index => index)
                .Select(index => questions[index])
                .ToList();

        if (selected.Count == 0)
        {
            return Result.Failure<Response?>(Error.Validation(
                "StudyGuideUpload.NoQuestionsSelected",
                "Select at least one question to add."));
        }

        // Stored questions may predate the distinct-incorrect-answers rule (#276): clean them and skip any question
        // left with no incorrect answers rather than creating an unplayable item.
        selected = selected
            .Select(question => question with
            {
                IncorrectAnswers = QuizPlayability.GetDistractors(question.CorrectAnswer, question.IncorrectAnswers)
            })
            .Where(question => question.IncorrectAnswers.Count > 0)
            .ToList();

        if (selected.Count == 0)
        {
            return Result.Failure<Response?>(Error.Validation(
                "StudyGuideUpload.NoQuestionsSelected",
                "None of the selected questions can be added because they have no valid incorrect answers."));
        }

        List<AddItemsBulk.KeywordRequest> keywords = GetStudyGuideUpload.ReadKeywords(upload)
            .Select(keyword => new AddItemsBulk.KeywordRequest(keyword, true))
            .ToList();

        AddItemsBulk.Request bulkRequest = new(
            IsPrivate: true,
            Category: upload.CategoryName,
            Keyword1: upload.NavigationKeyword1,
            Keyword2: upload.NavigationKeyword2,
            Keywords: keywords,
            Items: selected
                .Select(question => new AddItemsBulk.ItemRequest(
                    question.Question,
                    question.CorrectAnswer,
                    question.IncorrectAnswers,
                    question.Explanation ?? string.Empty))
                .ToList(),
            UploadId: upload.Id);

        Result<AddItemsBulk.Response> bulkResult = await AddItemsBulkHandler.HandleAsync(
            bulkRequest,
            db,
            simHashService,
            userContext,
            itemCategoryResolver,
            taxonomyRegistry,
            auditService,
            logger ?? NullLogger.Instance,
            cancellationToken);

        if (bulkResult.IsFailure)
        {
            return Result.Failure<Response?>(bulkResult.Error);
        }

        AddItemsBulk.Response bulk = bulkResult.Value;
        DateTime now = DateTime.UtcNow;
        upload.AcceptedUtc = now;
        upload.CreatedItemCount = bulk.CreatedCount;
        upload.UpdatedUtc = now;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success<Response?>(new Response(
            bulk.CreatedCount,
            bulk.DuplicateCount,
            bulk.FailedCount,
            (bulk.CreatedItemIds ?? []).Select(itemId => itemId.ToString()).ToList(),
            bulk.Errors.Select(error => error.ErrorMessage).ToList()));
    }
}
