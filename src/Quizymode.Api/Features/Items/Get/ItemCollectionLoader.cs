using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Services;

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
        // Admins can see all collections
        if (!_userContext.IsAuthenticated || string.IsNullOrEmpty(_userContext.UserId))
        {
            return itemCollectionsMap;
        }

        string collectionUserId = _userContext.UserId;

        // Get collections that belong to the authenticated user
        // Admins can see all collections
        // Project only Id, Name, CreatedAt so we don't require IsPublic (avoids dependency on AddCollectionDiscoveryAndSharing migration)
        var collectionItems = await _db.CollectionItems
            .Where(ci => itemIds.Contains(ci.ItemId))
            .Join(
                _db.Collections,
                ci => ci.CollectionId,
                c => c.Id,
                (ci, c) => new
                {
                    ci.ItemId,
                    CollectionId = c.Id,
                    CollectionName = c.Name,
                    CollectionCreatedAt = c.CreatedAt,
                    CollectionCreatedBy = c.CreatedBy
                })
            .Where(x => x.CollectionCreatedBy == collectionUserId || _userContext.IsAdmin)
            .OrderBy(x => x.CollectionName)
            .ToListAsync(_cancellationToken);

        foreach (var ci in collectionItems)
        {
            if (!itemCollectionsMap.ContainsKey(ci.ItemId))
            {
                itemCollectionsMap[ci.ItemId] = new List<GetItems.CollectionResponse>();
            }

            itemCollectionsMap[ci.ItemId].Add(new GetItems.CollectionResponse(
                ci.CollectionId.ToString(),
                ci.CollectionName,
                ci.CollectionCreatedAt));
        }

        return itemCollectionsMap;
    }
}
