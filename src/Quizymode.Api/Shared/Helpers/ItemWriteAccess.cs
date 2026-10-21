using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Owner-or-admin rule for item write endpoints (#286): PUT /items/{id}, DELETE /items/{id},
/// PUT /items/{id}/category.
/// </summary>
internal static class ItemWriteAccess
{
    public const string ForbiddenCode = "Item.Forbidden";

    public const string ForbiddenDetail = "You can only edit or delete your own items.";

    public static bool CanModify(Item item, IUserContext userContext)
    {
        return userContext.IsAdmin || IsOwner(item, userContext);
    }

    /// <summary>
    /// Returns null when the caller may modify the item; NotFound (identical to a missing id) when the caller
    /// cannot see the item; otherwise a Forbidden validation error.
    /// </summary>
    public static Error? Check(Item item, IUserContext userContext, string id)
    {
        if (CanModify(item, userContext))
        {
            return null;
        }

        if (!ItemVisibility.CanAccessById(item, userContext))
        {
            return Error.NotFound("Item.NotFound", $"Item with id {id} not found");
        }

        return Error.Validation(ForbiddenCode, ForbiddenDetail);
    }

    public static IResult ForbiddenResult()
    {
        return Results.Problem(
            title: "Forbidden",
            detail: ForbiddenDetail,
            statusCode: StatusCodes.Status403Forbidden,
            type: "https://tools.ietf.org/html/rfc7231#section-6.5.3");
    }

    private static bool IsOwner(Item item, IUserContext userContext)
    {
        return userContext.IsAuthenticated
            && !string.IsNullOrEmpty(userContext.UserId)
            && string.Equals(item.CreatedBy, userContext.UserId, StringComparison.Ordinal);
    }
}
