using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections;

/// <summary>
/// Owner-only rule for collection write endpoints (#289). Admins are treated as non-owners.
/// A non-owner who cannot see the collection gets NotFound (identical to a missing id); a non-owner who can
/// see it (public) gets Forbidden. In-memory only; never use inside an IQueryable.
/// </summary>
internal static class CollectionWriteAccess
{
    public const string ForbiddenCode = "Collection.Forbidden";

    public static bool IsOwner(Collection collection, IUserContext userContext)
    {
        return userContext.IsAuthenticated
            && !string.IsNullOrEmpty(userContext.UserId)
            && string.Equals(collection.CreatedBy, userContext.UserId, StringComparison.Ordinal);
    }

    public static Error? Check(Collection collection, IUserContext userContext, Guid id, string forbiddenDetail)
    {
        if (IsOwner(collection, userContext))
        {
            return null;
        }

        if (!GetCollectionById.CanAccess(collection, userContext))
        {
            return Error.NotFound("Collection.NotFound", $"Collection with id {id} not found");
        }

        return Error.Validation(ForbiddenCode, forbiddenDetail);
    }

    public static IResult ForbiddenResult(Error error)
    {
        return Results.Problem(
            title: "Forbidden",
            detail: error.Description,
            statusCode: StatusCodes.Status403Forbidden,
            type: "https://tools.ietf.org/html/rfc7231#section-6.5.3");
    }
}
