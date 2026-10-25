using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Taxonomy;

namespace Quizymode.Api.Services.Taxonomy.Suggestions;

internal sealed record TopicSuggestionResult(
    string CategorySlug,
    string L1,
    string L2,
    string Description,
    double Score,
    IReadOnlyList<string> MatchedTerms,
    string Reason);

/// <summary>
/// Suggests full (category, L1, L2) topic paths for free text, with no LLM and no per-request database text search.
/// Text with enough recognisable terms is scored by <see cref="TopicSuggestionModel"/>; anything else (empty, too short,
/// or low confidence) falls back to the caller's own recent paths, then popular public paths, then a static list from the
/// taxonomy order, so the result is never empty and every entry is a savable path.
/// </summary>
internal sealed class TopicSuggester(
    ITaxonomyRegistry registry,
    TopicTextAnalyzer analyzer,
    TopicSuggestionProfiles profiles,
    ITaxonomySearchIndex index,
    TaxonomySearchCounts counts,
    IMemoryCache cache,
    IOptions<TopicSuggestionOptions> options)
{
    internal const string ReasonText = "text";
    internal const string ReasonYours = "yours";
    internal const string ReasonPopular = "popular";
    internal const int MaxMatchedTerms = 5;
    private const int MaxYoursPaths = 10;

    private readonly TopicSuggestionOptions _options = options.Value;

    public async Task<IReadOnlyList<TopicSuggestionResult>> SuggestAsync(
        string text,
        int limit,
        string? userId,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        IReadOnlyList<AnalyzedToken> tokens = analyzer.Analyze(text);
        List<string> stems = tokens.Select(token => token.Stem).ToList();
        if (stems.Distinct(StringComparer.Ordinal).Count() >= _options.MinTerms)
        {
            await profiles.EnsureFreshAsync(db, cancellationToken);
            TopicSuggestionModel model = profiles.Model;
            TopicScoreOutcome outcome = model.Score(stems);
            if (outcome.Paths.Count > 0 && outcome.Confidence >= _options.ConfidenceThreshold)
            {
                return outcome.Paths
                    .Take(limit)
                    .Select(path => new TopicSuggestionResult(
                        path.Category,
                        path.L1,
                        path.L2,
                        path.Description,
                        Math.Round(path.Score, 3),
                        MatchedTerms(model, path.L2Index, tokens),
                        ReasonText))
                    .ToList();
            }
        }

        return await FallbackAsync(limit, userId, db, cancellationToken);
    }

    private static List<string> MatchedTerms(TopicSuggestionModel model, int l2Index, IReadOnlyList<AnalyzedToken> tokens)
    {
        List<string> matched = [];
        foreach (AnalyzedToken token in tokens)
        {
            if (matched.Count >= MaxMatchedTerms)
            {
                break;
            }

            if (!matched.Contains(token.Surface, StringComparer.Ordinal) && model.L2Contains(l2Index, token.Stem))
            {
                matched.Add(token.Surface);
            }
        }

        return matched;
    }

    private async Task<IReadOnlyList<TopicSuggestionResult>> FallbackAsync(
        int limit,
        string? userId,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        List<TopicSuggestionResult> results = [];
        HashSet<(string, string, string)> seen = [];

        void Add(string category, string l1, string l2, string description, string reason)
        {
            if (results.Count < limit
                && registry.IsValidNavigationPath(category, l1, l2)
                && seen.Add((category, l1, l2)))
            {
                results.Add(new TopicSuggestionResult(category, l1, l2, description, 0, [], reason));
            }
        }

        if (!string.IsNullOrEmpty(userId))
        {
            foreach ((string category, string l1, string l2) in await GetYoursAsync(userId, db, cancellationToken))
            {
                Add(category, l1, l2, DescriptionOf(category, l1, l2), ReasonYours);
            }
        }

        if (results.Count < limit)
        {
            await counts.EnsureFreshAsync(db, cancellationToken);
            foreach (TaxonomySearchNode node in index.Nodes
                         .Where(node => node.Level == TaxonomyNodeLevels.L2 && node.PublicItemCount > 0)
                         .OrderByDescending(node => node.PublicItemCount))
            {
                Add(node.CategorySlug, node.L1Slug!, node.L2Slug!, node.Description, ReasonPopular);
            }
        }

        // Last resort when the database has nothing public yet: the first L2 of each L1 in taxonomy order.
        for (int round = 0; results.Count < limit; round++)
        {
            bool any = false;
            foreach (string categorySlug in registry.CategorySlugs)
            {
                TaxonomyCategoryDefinition? category = registry.GetCategory(categorySlug);
                if (category is null || round >= category.L1Groups.Count)
                {
                    continue;
                }

                any = true;
                TaxonomyL1Group group = category.L1Groups[round];
                if (group.L2Leaves.Count > 0)
                {
                    Add(category.Slug, group.Slug, group.L2Leaves[0].Slug, group.L2Leaves[0].Description, ReasonPopular);
                }
            }

            if (!any)
            {
                break;
            }
        }

        return results;
    }

    private async Task<IReadOnlyList<(string Category, string L1, string L2)>> GetYoursAsync(
        string userId,
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        string key = $"topic-suggest-yours:{userId}";
        if (cache.TryGetValue(key, out IReadOnlyList<(string, string, string)>? cached) && cached is not null)
        {
            return cached;
        }

        var rows = await db.Items
            .AsNoTracking()
            .Where(item => item.CreatedBy == userId
                && item.CategoryId != null
                && item.NavigationKeywordId1 != null
                && item.NavigationKeywordId2 != null)
            .GroupBy(item => new
            {
                Category = item.Category!.Name,
                L1 = item.NavigationKeyword1!.Name,
                L2 = item.NavigationKeyword2!.Name
            })
            .Select(group => new { group.Key.Category, group.Key.L1, group.Key.L2, Latest = group.Max(item => item.CreatedAt) })
            .OrderByDescending(row => row.Latest)
            .Take(MaxYoursPaths)
            .ToListAsync(cancellationToken);

        IReadOnlyList<(string, string, string)> paths = rows
            .Select(row => (CategoryHelper.NameToSlug(row.Category), row.L1.ToLowerInvariant(), row.L2.ToLowerInvariant()))
            .ToList();
        cache.Set(key, paths, _options.YoursCacheTtl);
        return paths;
    }

    private string DescriptionOf(string category, string l1, string l2)
    {
        TaxonomyL1Group? group = registry.GetCategory(category)?.L1Groups
            .FirstOrDefault(candidate => string.Equals(candidate.Slug, l1, StringComparison.OrdinalIgnoreCase));
        return group?.L2Leaves.FirstOrDefault(leaf => string.Equals(leaf.Slug, l2, StringComparison.OrdinalIgnoreCase))?.Description
            ?? string.Empty;
    }
}
