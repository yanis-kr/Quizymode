using System.Linq.Expressions;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Shared.Helpers;

/// <summary>
/// Single source of truth for who may see an item (#285).
/// Visibility (lists, review queue): public, or created by the caller.
/// Access by id: visibility, or the caller is an admin.
/// </summary>
internal static class ItemVisibility
{
    public static bool IsVisibleTo(Item item, string? userId) =>
        !item.IsPrivate || (!string.IsNullOrEmpty(userId) && item.CreatedBy == userId);

    public static bool CanAccessById(Item item, IUserContext userContext) =>
        userContext.IsAdmin || IsVisibleTo(item, CallerId(userContext));

    public static Expression<Func<Item, bool>> VisibleTo(string? userId)
    {
        string callerId = userId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;
        return i => !i.IsPrivate || (hasCaller && i.CreatedBy == callerId);
    }

    public static Expression<Func<Item, bool>> AccessibleById(IUserContext userContext)
    {
        string callerId = CallerId(userContext) ?? string.Empty;
        bool hasCaller = callerId.Length > 0;
        bool isAdmin = userContext.IsAdmin;
        return i => isAdmin || !i.IsPrivate || (hasCaller && i.CreatedBy == callerId);
    }

    /// <summary>
    /// Items a caller may add to their own collection: visible to them, or published by the item's
    /// creator through one of the creator's own public collections. No admin exception.
    /// </summary>
    public static IQueryable<Item> AddableToCollection(ApplicationDbContext db, string? userId)
    {
        string callerId = userId ?? string.Empty;
        bool hasCaller = callerId.Length > 0;
        return db.Items.Where(i =>
            !i.IsPrivate
            || (hasCaller && i.CreatedBy == callerId)
            || (from ci in db.CollectionItems
                join c in db.Collections on ci.CollectionId equals c.Id
                where ci.ItemId == i.Id && c.IsPublic && c.CreatedBy == i.CreatedBy
                select ci.Id).Any());
    }

    /// <summary>
    /// Items a caller may read or write comments and ratings on (#293): accessible by id (admin, public, own),
    /// or published through a public collection owned by the item's creator.
    /// </summary>
    public static IQueryable<Item> InteractableBy(ApplicationDbContext db, IUserContext userContext) =>
        userContext.IsAdmin ? db.Items : AddableToCollection(db, CallerId(userContext));

    private static string? CallerId(IUserContext userContext) =>
        userContext.IsAuthenticated ? userContext.UserId : null;
}
