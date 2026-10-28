using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Games.GetRoster;

/// <summary>
/// Per scope: every visible, eligible item id (same visibility, category and navigation rules as GET /items), shuffled.
/// Then a round-robin merge across scopes that skips duplicates, and one load of the chosen items.
/// </summary>
internal static class GetGameRosterHandler
{
    public static async Task<Result<GetGameRoster.Response>> HandleAsync(
        GetGameRoster.Request request,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            int limit = request.Limit ?? GetGameRoster.DefaultLimit;
            List<string> scopes = NormalizeScopes(request.Scope);

            List<List<Guid>> shuffled = [];
            foreach (string scope in scopes)
            {
                List<Guid> ids = await LoadEligibleIdsAsync(scope, limit, db, userContext, cancellationToken);
                Shuffle(ids);
                shuffled.Add(ids);
            }

            (List<Guid> chosen, int[] returned) = MergeRoundRobin(shuffled, limit);
            List<GetItems.ItemResponse> items = await LoadItemsAsync(chosen, db, userContext, cancellationToken);

            List<GetGameRoster.ScopeResult> scopeResults = scopes
                .Select((scope, index) => new GetGameRoster.ScopeResult(
                    scope,
                    shuffled[index].Count,
                    returned[index],
                    returned[index] > 0 ? GetGameRoster.StatusOk : GetGameRoster.StatusEmpty))
                .ToList();

            return Result.Success(new GetGameRoster.Response(items, scopeResults));
        }
        catch (Exception ex)
        {
            return Result.Failure<GetGameRoster.Response>(
                Error.Problem("Games.RosterFailed", "Failed to get the game roster.", ex));
        }
    }

    /// <summary>Trims tokens and drops case-insensitive duplicates; no tokens means one global scope (empty token).</summary>
    private static List<string> NormalizeScopes(string[]? scopes)
    {
        List<string> normalized = (scopes ?? [])
            .Select(token => string.Join('/', token.Split('/').Select(segment => segment.Trim())))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        return normalized.Count == 0 ? [string.Empty] : normalized;
    }

    private static async Task<List<Guid>> LoadEligibleIdsAsync(
        string scope,
        int limit,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string[] segments = scope.Length == 0 ? [] : scope.Split('/');
        string? category = segments.Length > 0 ? segments[0] : null;
        List<string>? navigation = segments.Length > 1 ? segments.Skip(1).ToList() : null;

        GetItems.QueryRequest queryRequest = new(category, null, null, null, true, 1, limit, navigation);
        ItemQueryBuilder builder = new(db, userContext, cancellationToken);
        Result<IQueryable<Item>> built = await builder.BuildQueryAsync(queryRequest);
        if (built.IsFailure)
        {
            // An invalid navigation path means nothing is playable there, not a failed request.
            return [];
        }

        IQueryable<Guid> eligibleIds = db.Items.FromSqlRaw(GameRosterEligibility.Sql).Select(item => item.Id);
        return await built.Value
            .AsNoTracking()
            .Where(item => eligibleIds.Contains(item.Id))
            .Select(item => item.Id)
            .ToListAsync(cancellationToken);
    }

    private static void Shuffle(List<Guid> ids)
    {
        for (int i = ids.Count - 1; i > 0; i--)
        {
            int j = Random.Shared.Next(i + 1);
            (ids[i], ids[j]) = (ids[j], ids[i]);
        }
    }

    private static (List<Guid> Chosen, int[] Returned) MergeRoundRobin(List<List<Guid>> shuffled, int limit)
    {
        List<Guid> chosen = [];
        HashSet<Guid> seen = [];
        int[] returned = new int[shuffled.Count];
        int[] next = new int[shuffled.Count];

        bool progressed = true;
        while (chosen.Count < limit && progressed)
        {
            progressed = false;
            for (int s = 0; s < shuffled.Count && chosen.Count < limit; s++)
            {
                while (next[s] < shuffled[s].Count)
                {
                    Guid id = shuffled[s][next[s]++];
                    if (!seen.Add(id))
                    {
                        continue;
                    }

                    chosen.Add(id);
                    returned[s]++;
                    progressed = true;
                    break;
                }
            }
        }

        return (chosen, returned);
    }

    private static async Task<List<GetItems.ItemResponse>> LoadItemsAsync(
        List<Guid> ids,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        List<Item> items = await db.Items
            .AsNoTracking()
            .Where(i => ids.Contains(i.Id))
            .Include(i => i.ItemKeywords)
                .ThenInclude(ik => ik.Keyword)
            .Include(i => i.Category)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        Dictionary<Guid, int> order = ids.Select((id, index) => (id, index)).ToDictionary(x => x.id, x => x.index);
        ItemResponseMapper mapper = new(userContext);
        return items
            .OrderBy(i => order[i.Id])
            .Select(i => mapper.MapToResponse(i, []))
            .ToList();
    }
}
