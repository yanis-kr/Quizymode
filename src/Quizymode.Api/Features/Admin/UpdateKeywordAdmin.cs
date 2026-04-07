using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class UpdateKeywordAdmin
{
    public sealed record UpdateKeywordAdminRequest(string Name);

    public sealed record UpdateKeywordAdminResponse(Guid Id, string Name, string? Slug);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPut("admin/keywords/{id:guid}", Handler)
                .WithTags("Admin")
                .WithSummary("Rename a keyword (Admin only)")
                .WithDescription("Updates the name and slug of an existing keyword. Returns 409 if another public keyword already has that name.")
                .RequireAuthorization("Admin")
                .Produces<UpdateKeywordAdminResponse>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest)
                .Produces(StatusCodes.Status404NotFound)
                .Produces(StatusCodes.Status409Conflict);
        }

        private static async Task<IResult> Handler(
            Guid id,
            UpdateKeywordAdminRequest request,
            ApplicationDbContext db,
            CancellationToken cancellationToken)
        {
            Result<UpdateKeywordAdminResponse> result = await HandleAsync(id, request, db, cancellationToken);
            return result.Match(
                value => Results.Ok(value),
                failure => failure.Error.Code switch
                {
                    "Admin.KeywordNotFound" => Results.NotFound(),
                    "Admin.KeywordAlreadyExists" => Results.Conflict(new { failure.Error.Description }),
                    "Admin.InvalidKeywordName" => Results.BadRequest(new { failure.Error.Description }),
                    _ => CustomResults.Problem(result)
                });
        }
    }

    public static async Task<Result<UpdateKeywordAdminResponse>> HandleAsync(
        Guid id,
        UpdateKeywordAdminRequest request,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        Shared.Models.Keyword? keyword = await db.Keywords.FindAsync([id], cancellationToken);
        if (keyword is null)
            return Result.Failure<UpdateKeywordAdminResponse>(
                Error.NotFound("Admin.KeywordNotFound", "Keyword not found"));

        string normalized = KeywordHelper.NormalizeKeywordName(request.Name.Trim());
        if (!KeywordHelper.IsValidKeywordNameFormat(normalized))
            return Result.Failure<UpdateKeywordAdminResponse>(
                Error.Validation("Admin.InvalidKeywordName", $"Invalid keyword name '{request.Name}'. Use alphanumeric characters and hyphens only, max 30 characters."));

        bool conflict = await db.Keywords.AnyAsync(
            k => k.Id != id && !k.IsPrivate && k.Name.ToLower() == normalized.ToLower(),
            cancellationToken);
        if (conflict)
            return Result.Failure<UpdateKeywordAdminResponse>(
                Error.Validation("Admin.KeywordAlreadyExists", $"A public keyword named '{normalized}' already exists."));

        keyword.Name = normalized;
        string slug = KeywordHelper.NameToSlug(normalized);
        keyword.Slug = string.IsNullOrEmpty(slug) ? null : slug;
        await db.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateKeywordAdminResponse(keyword.Id, keyword.Name, keyword.Slug));
    }
}
