using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

/// <summary>
/// Admin feedback inbox (ANALYTICS-006): list, read, and triage <see cref="FeedbackSubmission"/> rows.
/// Contact emails are only ever returned from these admin endpoints.
/// </summary>
public static class AdminFeedback
{
    public const int MaxPageSize = 100;

    public sealed record ListQuery(
        int Page = 1,
        int PageSize = 25,
        string? Type = null,
        string? Status = null,
        DateTime? From = null,
        DateTime? To = null,
        string? Search = null);

    /// <param name="UserEmail">Email of the signed-in submitter, when any.</param>
    /// <param name="ContactEmail">Email typed into the feedback form, when any.</param>
    /// <param name="SessionId">Analytics session the report was sent from; the journey is read via the page-view session endpoint.</param>
    public sealed record FeedbackResponse(
        Guid Id,
        string Type,
        string Status,
        string Details,
        string PageUrl,
        string? AdditionalKeywords,
        string? UserEmail,
        string? ContactEmail,
        string? UserAgent,
        string? SessionId,
        DateTime CreatedAt);

    /// <param name="NewCount">Submissions currently in the New status (unfiltered), for the dashboard badge.</param>
    public sealed record ListResponse(
        List<FeedbackResponse> Items,
        int TotalCount,
        int Page,
        int PageSize,
        int NewCount);

    public sealed record UpdateStatusRequest(string Status);

    public sealed class UpdateStatusValidator : AbstractValidator<UpdateStatusRequest>
    {
        public UpdateStatusValidator()
        {
            RuleFor(x => x.Status)
                .Must(status => FeedbackStatus.Normalize(status) is not null)
                .WithMessage("Status must be New, Reviewed, or Archived.");
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/feedback", ListHandler)
                .WithTags("Admin")
                .WithSummary("List feedback submissions, newest first (Admin only)")
                .WithDescription("Paged (pageSize max 100). Filters: type (reportIssue, requestItems, generalFeedback), status (New, Reviewed, Archived), from/to (UTC dates, inclusive), and search over details, page URL, and emails. Also returns the count of New submissions.")
                .RequireAuthorization("Admin")
                .Produces<ListResponse>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest);

            app.MapGet("admin/feedback/{id:guid}", GetHandler)
                .WithTags("Admin")
                .WithSummary("Get one feedback submission (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<FeedbackResponse>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status404NotFound);

            app.MapPut("admin/feedback/{id:guid}/status", UpdateStatusHandler)
                .WithTags("Admin")
                .WithSummary("Set a feedback submission's status to New, Reviewed, or Archived (Admin only)")
                .RequireAuthorization("Admin")
                .Produces<FeedbackResponse>(StatusCodes.Status200OK)
                .ProducesProblem(StatusCodes.Status400BadRequest)
                .ProducesProblem(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> ListHandler(
            int page = 1,
            int pageSize = 25,
            string? type = null,
            string? status = null,
            DateTime? from = null,
            DateTime? to = null,
            string? search = null,
            ApplicationDbContext db = null!,
            CancellationToken cancellationToken = default)
        {
            Result<ListResponse> result = await ListAsync(
                new ListQuery(page, pageSize, type, status, from, to, search), db, cancellationToken);

            return result.Match(value => Results.Ok(value), error => CustomResults.Problem(result));
        }

        private static async Task<IResult> GetHandler(
            Guid id,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<FeedbackResponse> result = await GetAsync(id, db, cancellationToken);

            return result.Match(value => Results.Ok(value), error => CustomResults.Problem(result));
        }

        private static async Task<IResult> UpdateStatusHandler(
            Guid id,
            UpdateStatusRequest request,
            IValidator<UpdateStatusRequest> validator,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            FluentValidation.Results.ValidationResult validation = await validator.ValidateAsync(request, cancellationToken);
            if (!validation.IsValid)
            {
                return Results.BadRequest(validation.Errors);
            }

            Result<FeedbackResponse> result = await UpdateStatusAsync(id, request, db, cancellationToken);

            return result.Match(value => Results.Ok(value), error => CustomResults.Problem(result));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            services.AddScoped<IValidator<UpdateStatusRequest>, UpdateStatusValidator>();
        }
    }

    public static async Task<Result<ListResponse>> ListAsync(
        ListQuery query,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.PageSize < 1 || query.PageSize > MaxPageSize)
        {
            return Result.Failure<ListResponse>(
                Error.Validation("Admin.Feedback.InvalidPaging", $"Page must be at least 1 and pageSize between 1 and {MaxPageSize}."));
        }

        string? status = null;
        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            status = FeedbackStatus.Normalize(query.Status);
            if (status is null)
            {
                return Result.Failure<ListResponse>(
                    Error.Validation("Admin.Feedback.InvalidStatus", "Status must be New, Reviewed, or Archived."));
            }
        }

        IQueryable<FeedbackSubmission> filtered = db.FeedbackSubmissions.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Type))
        {
            string type = query.Type.Trim();
            filtered = filtered.Where(submission => submission.Type == type);
        }

        if (status is not null)
        {
            filtered = filtered.Where(submission => submission.Status == status);
        }

        if (query.From.HasValue)
        {
            DateTime from = DateTime.SpecifyKind(query.From.Value.Date, DateTimeKind.Utc);
            filtered = filtered.Where(submission => submission.CreatedAt >= from);
        }

        if (query.To.HasValue)
        {
            DateTime toExclusive = DateTime.SpecifyKind(query.To.Value.Date.AddDays(1), DateTimeKind.Utc);
            filtered = filtered.Where(submission => submission.CreatedAt < toExclusive);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim().ToLower();
            filtered = filtered.Where(submission =>
                submission.Details.ToLower().Contains(term)
                || submission.PageUrl.ToLower().Contains(term)
                || (submission.Email != null && submission.Email.ToLower().Contains(term))
                || db.Users.Any(user => user.Id == submission.UserId && user.Email != null && user.Email.ToLower().Contains(term)));
        }

        int total = await filtered.CountAsync(cancellationToken);
        int newCount = await db.FeedbackSubmissions.CountAsync(submission => submission.Status == FeedbackStatus.New, cancellationToken);

        IQueryable<FeedbackSubmission> page = filtered
            .OrderByDescending(submission => submission.CreatedAt)
            .ThenByDescending(submission => submission.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize);

        // Project after paging; Skip/Take wrap the ordering, so re-apply it on the projected rows.
        List<FeedbackResponse> items = (await Project(db, page).ToListAsync(cancellationToken))
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .ToList();

        return Result.Success(new ListResponse(items, total, query.Page, query.PageSize, newCount));
    }

    public static async Task<Result<FeedbackResponse>> GetAsync(
        Guid id,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        FeedbackResponse? item = await Project(db, db.FeedbackSubmissions.AsNoTracking().Where(submission => submission.Id == id))
            .FirstOrDefaultAsync(cancellationToken);

        return item is null
            ? Result.Failure<FeedbackResponse>(Error.NotFound("Admin.Feedback.NotFound", "Feedback submission not found."))
            : Result.Success(item);
    }

    public static async Task<Result<FeedbackResponse>> UpdateStatusAsync(
        Guid id,
        UpdateStatusRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        string? status = FeedbackStatus.Normalize(request.Status);
        if (status is null)
        {
            return Result.Failure<FeedbackResponse>(
                Error.Validation("Admin.Feedback.InvalidStatus", "Status must be New, Reviewed, or Archived."));
        }

        FeedbackSubmission? submission = await db.FeedbackSubmissions.FirstOrDefaultAsync(row => row.Id == id, cancellationToken);
        if (submission is null)
        {
            return Result.Failure<FeedbackResponse>(Error.NotFound("Admin.Feedback.NotFound", "Feedback submission not found."));
        }

        submission.Status = status;
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(id, db, cancellationToken);
    }

    private static IQueryable<FeedbackResponse> Project(ApplicationDbContext db, IQueryable<FeedbackSubmission> source) =>
        source.Select(submission => new FeedbackResponse(
            submission.Id,
            submission.Type,
            submission.Status,
            submission.Details,
            submission.PageUrl,
            submission.AdditionalKeywords,
            db.Users.Where(user => user.Id == submission.UserId).Select(user => user.Email).FirstOrDefault(),
            submission.Email,
            submission.UserAgent,
            submission.SessionId,
            submission.CreatedAt));
}
