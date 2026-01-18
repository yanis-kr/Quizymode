using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Items.Get;

internal sealed class ItemCollectionLoader
{
    private readonly ApplicationDbContext _db;
    private readonly IUserContext _userContext;
    private readonly CancellationToken _cancellationToken;

    public ItemCollectionLoader(
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        _db = db;
        _userContext = userContext;
        _cancellationToken = cancellationToken;
    }

    public async Task<Dictionary<Guid, List<GetItems.CollectionResponse>>> LoadCollectionsAsync(
        List<Guid> itemIds)
    {
        Dictionary<Guid, List<GetItems.CollectionResponse>> itemCollectionsMap = new();

        if (itemIds.Count == 0)
        {
            return itemCollectionsMap;
        }

        // Only return collections if user is authenticated
        // Collections are filtered by authenticated userId - no collections for anonymous users
        if (!_userContext.IsAuthenticated || string.IsNullOrEmpty(_userContext.UserId))
        {
            return itemCollectionsMap;
        }

        string collectionUserId = _userContext.UserId;

        // Get collections that belong to the authenticated user
        // Admins can see all collections
        var collectionItems = await _db.CollectionItems
            .Where(ci => itemIds.Contains(ci.ItemId))
            .Join(_db.Collections, ci => ci.CollectionId, c => c.Id, (ci, c) => new { ItemId = ci.ItemId, Collection = c })
            .Where(x => x.Collection.CreatedBy == collectionUserId || _userContext.IsAdmin)
            .ToListAsync(_cancellationToken);

        foreach (var ci in collectionItems)
        {
            Collection collection = ci.Collection;

            if (!itemCollectionsMap.ContainsKey(ci.ItemId))
            {
                itemCollectionsMap[ci.ItemId] = new List<GetItems.CollectionResponse>();
            }

            itemCollectionsMap[ci.ItemId].Add(new GetItems.CollectionResponse(
                collection.Id.ToString(),
                collection.Name,
                collection.CreatedAt));
        }

        return itemCollectionsMap;
    }
}
