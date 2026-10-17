using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>GET /study-guide-uploads/{id}: owner-only status and generated questions (poll while Pending).</summary>
public static class GetStudyGuideUpload
{
    public sealed record Response(
        string Id,
        string Status,
        string Category,
        string NavigationKeyword1,
        string NavigationKeyword2,
        List<string> Keywords,
        List<StudyGuideGeneratedQuestion> Questions,
        string? Error,
        DateTime CreatedUtc,
        DateTime? CompletedUtc,
        DateTime? AcceptedUtc,
        int? CreatedItemCount);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("study-guide-uploads/{id:guid}", Handler)
                .WithTags("StudyGuideUploads")
                .WithSummary("Get a study guide upload with its generation status and questions")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status404NotFound);
        }

        private static async Task<IResult> Handler(
            Guid id,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            if (!userContext.IsAuthenticated || string.IsNullOrEmpty(userContext.UserId))
            {
                return Results.Unauthorized();
            }

            Response? response = await HandleAsync(id, db, userContext.UserId, cancellationToken);
            return response is null ? Results.NotFound() : Results.Ok(response);
        }
    }

    public static async Task<Response?> HandleAsync(
        Guid id,
        ApplicationDbContext db,
        string userId,
        CancellationToken cancellationToken)
    {
        StudyGuideUpload? upload = await db.StudyGuideUploads
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == id && u.UserId == userId, cancellationToken);

        return upload is null ? null : ToResponse(upload);
    }

    internal static Response ToResponse(StudyGuideUpload upload) =>
        new(
            upload.Id.ToString(),
            upload.Status.ToString(),
            upload.CategoryName,
            upload.NavigationKeyword1,
            upload.NavigationKeyword2,
            ReadKeywords(upload),
            ReadQuestions(upload),
            upload.Error,
            upload.CreatedUtc,
            upload.CompletedUtc,
            upload.AcceptedUtc,
            upload.CreatedItemCount);

    internal static List<string> ReadKeywords(StudyGuideUpload upload) =>
        string.IsNullOrEmpty(upload.KeywordsJson)
            ? []
            : JsonSerializer.Deserialize<List<string>>(upload.KeywordsJson) ?? [];

    internal static List<StudyGuideGeneratedQuestion> ReadQuestions(StudyGuideUpload upload) =>
        string.IsNullOrEmpty(upload.GeneratedQuestionsJson)
            ? []
            : JsonSerializer.Deserialize<List<StudyGuideGeneratedQuestion>>(
                upload.GeneratedQuestionsJson,
                StudyGuideUploadProcessor.QuestionJsonOptions) ?? [];
}
