using Quizymode.Api.Shared.Taxonomy;

namespace Quizymode.Api.Services.Taxonomy;

internal sealed class TaxonomySearchIndex : ITaxonomySearchIndex
{
    private const double ExactScore = 1.0;
    private const double PrefixScore = 0.8;
    private const double TypoScore = 0.6;
    private const double SlugWeight = 1.0;
    private const double DescriptionWeight = 0.6;
    private const int MaxQueryTokens = 8;

    private sealed record IndexedNode(TaxonomySearchNode Node, IReadOnlyList<(string Term, double Weight)> Terms);

    private sealed record Snapshot(
        IReadOnlyList<TaxonomySearchNode> Nodes,
        IReadOnlyList<IndexedNode> Indexed,
        IReadOnlyDictionary<(string, string?, string?), TaxonomySearchNode> ByKey,
        DateTimeOffset? RefreshedAtUtc);

    private readonly IReadOnlyList<IndexedNode> _structure;
    private Snapshot _snapshot;

    public TaxonomySearchIndex(ITaxonomyRegistry registry)
    {
        List<IndexedNode> indexed = [];
        foreach (string categorySlug in registry.CategorySlugs)
        {
            TaxonomyCategoryDefinition? category = registry.GetCategory(categorySlug);
            if (category is null)
            {
                continue;
            }

            indexed.Add(Build(TaxonomyNodeLevels.Category, category.Slug, null, null, category.Description, category.Slug));
            foreach (TaxonomyL1Group group in category.L1Groups)
            {
                indexed.Add(Build(TaxonomyNodeLevels.L1, category.Slug, group.Slug, null, group.Description, group.Slug));
                foreach (TaxonomyL2Leaf leaf in group.L2Leaves)
                {
                    indexed.Add(Build(TaxonomyNodeLevels.L2, category.Slug, group.Slug, leaf.Slug, leaf.Description, leaf.Slug));
                }
            }
        }

        _structure = indexed;
        _snapshot = BuildSnapshot(indexed, null);
    }

    public IReadOnlyList<TaxonomySearchNode> Nodes => Volatile.Read(ref _snapshot).Nodes;

    public DateTimeOffset? CountsRefreshedAtUtc => Volatile.Read(ref _snapshot).RefreshedAtUtc;

    public TaxonomySearchNode? Find(string categorySlug, string? l1Slug, string? l2Slug)
    {
        return Volatile.Read(ref _snapshot).ByKey.TryGetValue((categorySlug, l1Slug, l2Slug), out TaxonomySearchNode? node)
            ? node
            : null;
    }

    public void ReplaceCounts(IReadOnlyDictionary<(string Category, string? L1, string? L2), int> counts, DateTimeOffset refreshedAtUtc)
    {
        List<IndexedNode> next = _structure
            .Select(entry => entry with
            {
                Node = entry.Node with
                {
                    PublicItemCount = counts.TryGetValue((entry.Node.CategorySlug, entry.Node.L1Slug, entry.Node.L2Slug), out int count) ? count : 0
                }
            })
            .ToList();
        Volatile.Write(ref _snapshot, BuildSnapshot(next, refreshedAtUtc));
    }

    public IReadOnlyList<TaxonomySearchHit> Search(string query, TaxonomyNodeLevels levels, int limit, int offset)
    {
        List<string> tokens = Tokenize(query).Distinct(StringComparer.Ordinal).Take(MaxQueryTokens).ToList();
        if (tokens.Count == 0 || limit <= 0)
        {
            return [];
        }

        Snapshot snapshot = Volatile.Read(ref _snapshot);
        List<TaxonomySearchHit> hits = [];
        foreach (IndexedNode entry in snapshot.Indexed)
        {
            if ((entry.Node.Level & levels) == 0)
            {
                continue;
            }

            double total = 0;
            List<string> matched = [];
            bool allMatched = true;
            foreach (string token in tokens)
            {
                (double score, string? term) = BestMatch(token, entry.Terms);
                if (score <= 0)
                {
                    allMatched = false;
                    break;
                }

                total += score;
                matched.Add(term!);
            }

            if (allMatched)
            {
                hits.Add(new TaxonomySearchHit(entry.Node, total / tokens.Count, matched.Distinct(StringComparer.Ordinal).ToList()));
            }
        }

        return hits
            .OrderByDescending(hit => hit.Score)
            .ThenBy(hit => hit.Node.Level)
            .ThenByDescending(hit => hit.Node.PublicItemCount > 0)
            .ThenByDescending(hit => hit.Node.PublicItemCount)
            .ThenBy(hit => hit.Node.CategorySlug, StringComparer.Ordinal)
            .ThenBy(hit => hit.Node.L1Slug, StringComparer.Ordinal)
            .ThenBy(hit => hit.Node.L2Slug, StringComparer.Ordinal)
            .Skip(Math.Max(0, offset))
            .Take(limit)
            .ToList();
    }

    /// <summary>Lowercases and splits on every character that is not a letter or digit.</summary>
    internal static IEnumerable<string> Tokenize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            yield break;
        }

        int start = -1;
        string lower = text.ToLowerInvariant();
        for (int index = 0; index <= lower.Length; index++)
        {
            bool isWordChar = index < lower.Length && char.IsLetterOrDigit(lower[index]);
            if (isWordChar)
            {
                if (start < 0)
                {
                    start = index;
                }
            }
            else if (start >= 0)
            {
                yield return lower[start..index];
                start = -1;
            }
        }
    }

    private static (double Score, string? Term) BestMatch(string token, IReadOnlyList<(string Term, double Weight)> terms)
    {
        double best = 0;
        string? bestTerm = null;
        foreach ((string term, double weight) in terms)
        {
            double match = 0;
            if (term == token)
            {
                match = ExactScore;
            }
            else if (token.Length >= 2 && term.StartsWith(token, StringComparison.Ordinal))
            {
                match = PrefixScore;
            }
            else if (token.Length >= 4 && IsWithinOneEdit(token, term))
            {
                match = TypoScore;
            }

            double score = match * weight;
            if (score > best)
            {
                best = score;
                bestTerm = term;
            }
        }

        return (best, bestTerm);
    }

    /// <summary>True when the strings differ by at most one insertion, deletion or substitution.</summary>
    internal static bool IsWithinOneEdit(string a, string b)
    {
        if (Math.Abs(a.Length - b.Length) > 1)
        {
            return false;
        }

        int i = 0;
        int j = 0;
        bool edited = false;
        while (i < a.Length && j < b.Length)
        {
            if (a[i] == b[j])
            {
                i++;
                j++;
                continue;
            }

            if (edited)
            {
                return false;
            }

            edited = true;
            if (a.Length > b.Length)
            {
                i++;
            }
            else if (a.Length < b.Length)
            {
                j++;
            }
            else
            {
                i++;
                j++;
            }
        }

        // Any leftover character is a single trailing insertion or deletion.
        int remaining = (a.Length - i) + (b.Length - j);
        return edited ? remaining == 0 : remaining <= 1;
    }

    private static IndexedNode Build(
        TaxonomyNodeLevels level,
        string category,
        string? l1,
        string? l2,
        string description,
        string name)
    {
        Dictionary<string, double> terms = new(StringComparer.Ordinal);
        AddTerms(terms, Tokenize(name), SlugWeight);
        AddTerms(terms, Tokenize(description), DescriptionWeight);

        TaxonomySearchNode node = new(level, category, l1, l2, name, description, 0);
        return new IndexedNode(node, terms.Select(pair => (pair.Key, pair.Value)).ToList());
    }

    private static void AddTerms(Dictionary<string, double> terms, IEnumerable<string> tokens, double weight)
    {
        foreach (string token in tokens)
        {
            Upsert(terms, token, weight);
            foreach (string expanded in TaxonomySearchAliases.Expand(token))
            {
                Upsert(terms, expanded, weight);
            }
        }
    }

    private static void Upsert(Dictionary<string, double> terms, string term, double weight)
    {
        if (!terms.TryGetValue(term, out double existing) || weight > existing)
        {
            terms[term] = weight;
        }
    }

    private static Snapshot BuildSnapshot(IReadOnlyList<IndexedNode> indexed, DateTimeOffset? refreshedAtUtc)
    {
        Dictionary<(string, string?, string?), TaxonomySearchNode> byKey = new();
        foreach (IndexedNode entry in indexed)
        {
            byKey[(entry.Node.CategorySlug, entry.Node.L1Slug, entry.Node.L2Slug)] = entry.Node;
        }

        return new Snapshot(indexed.Select(entry => entry.Node).ToList(), indexed, byKey, refreshedAtUtc);
    }
}
