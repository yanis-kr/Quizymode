using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Progress;

/// <summary>
/// Stages known/unknown changes for a user's items (#685). Stages only: the caller's own SaveChanges commits them in the
/// same transaction as the session or review change they belong to.
/// </summary>
internal static class UserItemProgressWriter
{
    public static async Task StageAsync(
        ApplicationDbContext db,
        string userId,
        IReadOnlyCollection<Guid> correctItemIds,
        IReadOnlyCollection<Guid> missedItemIds,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        List<Guid> ids = correctItemIds.Concat(missedItemIds).Distinct().ToList();
        if (ids.Count == 0) return;

        // Only items that exist get a row, so arbitrary ids never grow the table.
        HashSet<Guid> existingItems = (await db.Items.AsNoTracking()
            .Where(i => ids.Contains(i.Id))
            .Select(i => i.Id)
            .ToListAsync(cancellationToken)).ToHashSet();
        Dictionary<Guid, UserItemProgress> rows = await db.UserItemProgress
            .Where(p => p.UserId == userId && ids.Contains(p.ItemId))
            .ToDictionaryAsync(p => p.ItemId, cancellationToken);

        HashSet<Guid> correct = correctItemIds.ToHashSet();
        foreach (Guid id in ids.Where(existingItems.Contains))
        {
            bool known = correct.Contains(id);
            if (!rows.TryGetValue(id, out UserItemProgress? row))
            {
                row = new UserItemProgress { UserId = userId, ItemId = id };
                db.UserItemProgress.Add(row);
            }
            row.IsKnown = known;
            if (known) row.LastCorrectAt = nowUtc;
            row.UpdatedAt = nowUtc;
        }
    }
}
