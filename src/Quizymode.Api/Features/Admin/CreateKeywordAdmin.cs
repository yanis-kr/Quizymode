using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Admin;

public static class CreateKeywordAdmin
{
    public sealed record CreateKeywordAdminRequest(string Name);

    public sealed record CreateKeywordAdminResponse(Guid Id, string Name, string? Slug);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("admin/keywords", Handler)
                .WithTags("Admin")
                .WithSummary("Create a new public keyword (Admin only)")
                .WithDescription("Creates a new public keyword. Name must be alphanumeric + hyphens, max 30 chars. Returns 409 if a public keyword with that name already exists.")
                .RequireAuthorization("Admin")
                .Produces<CreateKeywordAdminResponse>(StatusCodes.Status201Created)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> Handler(
            CreateKeywordAdminRequest request,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<CreateKeywordAdminResponse> result = await HandleAsync(request, db, userContext, cancellationToken);
            return result.Match(
                value => Results.Created($"/admin/keywords/{value.Id}", value),
                failure => failure.Error.Code switch
                {
                    "Admin.KeywordAlreadyExists" => Results.Conflict(new { failure.Error.Description }),
                    "Admin.InvalidKeywordName" => Results.BadRequest(new { failure.Error.Description }),
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<CreateKeywordAdminResponse>> HandleAsync(
        CreateKeywordAdminRequest request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string normalized = KeywordHelper.NormalizeKeywordName(request.Name.Trim());
        if (!KeywordHelper.IsValidKeywordNameFormat(normalized))
            return Result.Failure<CreateKeywordAdminResponse>(
                Error.Validation("Admin.InvalidKeywordName", $"Invalid keyword name '{request.Name}'. Use alphanumeric characters and hyphens only, max 30 characters."));

        bool exists = await db.Keywords.AnyAsync(
            k => !k.IsPrivate && k.Name.ToLower() == normalized.ToLower(),
            cancellationToken);
        if (exists)
            return Result.Failure<CreateKeywordAdminResponse>(
                Error.Validation("Admin.KeywordAlreadyExists", $"A public keyword named '{normalized}' already exists."));

        string slug = KeywordHelper.NameToSlug(normalized);
        Keyword keyword = new()
        {
            Id = Guid.NewGuid(),
            Name = normalized,
            Slug = string.IsNullOrEmpty(slug) ? null : slug,
            IsPrivate = false,
            CreatedBy = userContext.UserId ?? "admin",
            CreatedAt = DateTime.UtcNow,
            IsReviewPending = false
        };
        db.Keywords.Add(keyword);
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new CreateKeywordAdminResponse(keyword.Id, keyword.Name, keyword.Slug));
    }
}
