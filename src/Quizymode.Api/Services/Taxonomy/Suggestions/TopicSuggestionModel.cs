using Quizymode.Api.Shared.Taxonomy;

namespace Quizymode.Api.Services.Taxonomy.Suggestions;

/// <summary>One public item reduced to its distinct analyzed terms. Nothing else about the item is kept.</summary>
internal sealed record TopicProfileItem(string Category, string L1, string L2, IReadOnlyList<string> Terms);

/// <summary>An L2 topic ranked for a query. <see cref="Score"/> is the 0-1 path score (L2, parent L1 and category).</summary>
internal sealed record TopicPathScore(int L2Index, string Category, string L1, string L2, string Description, double Score, int PublicItemCount);

/// <summary>The ranked paths for a query, how well the best one covers the query terms (0-1).</summary>
internal sealed record TopicScoreOutcome(double Confidence, IReadOnlyList<TopicPathScore> Paths);

/// <summary>
/// Immutable, in-memory BM25 model over the taxonomy: one document per category, per L1 and per L2. Each document is the
/// node's own taxonomy text (slug and description) plus one count per public item that contains a term, so a large node
/// does not win by repetition. A query is scored per level and combined as
/// <c>alpha * L2 + beta * parent L1 + gamma * category</c> (the L2 to L1 roll-up). It never touches the database.
/// </summary>
internal sealed class TopicSuggestionModel
{
    private sealed record TermPostings(int[] Nodes, float[] Tf, double Idf);

    private sealed class Level(int count)
    {
        public Dictionary<string, TermPostings> Terms { get; } = new(StringComparer.Ordinal);

        public double[] DocLength { get; } = new double[count];

        public double AvgDocLength { get; set; }
    }

    private sealed record L2Node(string Category, string L1, string L2, string Description, int L1Index, int CategoryIndex);

    private readonly TopicSuggestionOptions _options;
    private readonly L2Node[] _l2Nodes;
    private readonly int[] _publicItemCounts;
    private readonly int _l1Count;
    private readonly Level _l2;
    private readonly Level _l1;
    private readonly Level _category;

    private TopicSuggestionModel(
        TopicSuggestionOptions options,
        L2Node[] l2Nodes,
        int[] publicItemCounts,
        int l1Count,
        Level l2,
        Level l1,
        Level category,
        int profileItemCount)
    {
        _options = options;
        _l2Nodes = l2Nodes;
        _publicItemCounts = publicItemCounts;
        _l1Count = l1Count;
        _l2 = l2;
        _l1 = l1;
        _category = category;
        ProfileItemCount = profileItemCount;
    }

    /// <summary>Public items folded into the profiles (0 for the taxonomy-text-only model).</summary>
    public int ProfileItemCount { get; }

    public int L2Count => _l2Nodes.Length;

    /// <summary>Builds the model from the taxonomy text plus the given public item profiles.</summary>
    public static TopicSuggestionModel Build(
        ITaxonomyRegistry registry,
        TopicSuggestionOptions options,
        TopicTextAnalyzer analyzer,
        IEnumerable<TopicProfileItem> items)
    {
        List<L2Node> l2Nodes = [];
        List<Dictionary<string, double>> l2Tf = [];
        List<Dictionary<string, double>> l1Tf = [];
        List<Dictionary<string, double>> categoryTf = [];
        Dictionary<(string, string, string), int> l2ByKey = new();

        foreach (string categorySlug in registry.CategorySlugs)
        {
            TaxonomyCategoryDefinition? category = registry.GetCategory(categorySlug);
            if (category is null)
            {
                continue;
            }

            int categoryIndex = categoryTf.Count;
            categoryTf.Add(TaxonomyText(analyzer, options, category.Slug, category.Description));
            foreach (TaxonomyL1Group group in category.L1Groups)
            {
                int l1Index = l1Tf.Count;
                l1Tf.Add(TaxonomyText(analyzer, options, group.Slug, group.Description));
                foreach (TaxonomyL2Leaf leaf in group.L2Leaves)
                {
                    l2ByKey[(category.Slug, group.Slug, leaf.Slug)] = l2Nodes.Count;
                    l2Nodes.Add(new L2Node(category.Slug, group.Slug, leaf.Slug, leaf.Description, l1Index, categoryIndex));
                    l2Tf.Add(TaxonomyText(analyzer, options, leaf.Slug, leaf.Description));
                }
            }
        }

        int[] publicCounts = new int[l2Nodes.Count];
        int itemCount = 0;
        foreach (TopicProfileItem item in items)
        {
            if (!l2ByKey.TryGetValue((item.Category, item.L1, item.L2), out int l2Index))
            {
                continue;
            }

            itemCount++;
            publicCounts[l2Index]++;
            L2Node node = l2Nodes[l2Index];
            foreach (string term in item.Terms)
            {
                Add(l2Tf[l2Index], term, 1);
                Add(l1Tf[node.L1Index], term, 1);
                Add(categoryTf[node.CategoryIndex], term, 1);
            }
        }

        return new TopicSuggestionModel(
            options,
            l2Nodes.ToArray(),
            publicCounts,
            l1Tf.Count,
            BuildLevel(l2Tf),
            BuildLevel(l1Tf),
            BuildLevel(categoryTf),
            itemCount);
    }

    /// <summary>
    /// Ranks the best L2 under each distinct L1, highest path score first, ties by public item count then taxonomy order.
    /// <paramref name="queryTerms"/> are analyzed stems; a repeated term counts with a damped weight.
    /// </summary>
    public TopicScoreOutcome Score(IReadOnlyList<string> queryTerms)
    {
        List<(string Term, double Weight)> weighted = queryTerms
            .GroupBy(term => term, StringComparer.Ordinal)
            .Take(_options.MaxQueryTerms)
            .Select(group => (group.Key, Math.Sqrt(Math.Min(group.Count(), 3))))
            .ToList();

        double[] l2Raw = ScoreLevel(_l2, weighted);
        double l2Max = l2Raw.Length == 0 ? 0 : l2Raw.Max();
        if (l2Max <= 0)
        {
            return new TopicScoreOutcome(0, []);
        }

        double[] l1Raw = ScoreLevel(_l1, weighted);
        double[] categoryRaw = ScoreLevel(_category, weighted);
        double l1Max = Math.Max(l1Raw.Max(), double.Epsilon);
        double categoryMax = Math.Max(categoryRaw.Max(), double.Epsilon);

        // The most one L2 could score if it matched every query term at full saturation. A term the model has never
        // seen counts at the highest idf, so chatter and typos pull the confidence down instead of being ignored.
        double unknownIdf = Math.Log(1 + (_l2Nodes.Length + 0.5) / 0.5);
        double maximum = 0;
        foreach ((string term, double weight) in weighted)
        {
            double idf = _l2.Terms.TryGetValue(term, out TermPostings? postings) ? postings.Idf : unknownIdf;
            maximum += weight * idf * (_options.K1 + 1);
        }

        double confidence = maximum <= 0 ? 0 : Math.Min(1, l2Max / maximum);

        int[] bestPerL1 = new int[_l1Count];
        Array.Fill(bestPerL1, -1);
        double[] scores = new double[_l2Nodes.Length];
        for (int index = 0; index < _l2Nodes.Length; index++)
        {
            L2Node node = _l2Nodes[index];
            double score = _options.Alpha * (l2Raw[index] / l2Max)
                + _options.Beta * (l1Raw[node.L1Index] / l1Max)
                + _options.Gamma * (categoryRaw[node.CategoryIndex] / categoryMax);
            scores[index] = score;
            int best = bestPerL1[node.L1Index];
            if (score > 0 && (best < 0 || IsBetter(index, best, scores)))
            {
                bestPerL1[node.L1Index] = index;
            }
        }

        List<int> ranked = bestPerL1.Where(index => index >= 0).ToList();
        ranked.Sort((left, right) => IsBetter(left, right, scores) ? -1 : IsBetter(right, left, scores) ? 1 : 0);
        double top = ranked.Count == 0 ? 0 : scores[ranked[0]];
        List<TopicPathScore> paths = ranked
            .Where(index => scores[index] >= top * _options.MinRelativeScore)
            .Select(index =>
            {
                L2Node node = _l2Nodes[index];
                return new TopicPathScore(index, node.Category, node.L1, node.L2, node.Description, scores[index], _publicItemCounts[index]);
            })
            .ToList();

        return new TopicScoreOutcome(confidence, paths);
    }

    /// <summary>True when the L2 document contains the analyzed term (used to explain a suggestion with input words).</summary>
    public bool L2Contains(int l2Index, string term)
    {
        return _l2.Terms.TryGetValue(term, out TermPostings? postings)
            && Array.BinarySearch(postings.Nodes, l2Index) >= 0;
    }

    private bool IsBetter(int candidate, int incumbent, double[] scores)
    {
        if (scores[candidate] != scores[incumbent])
        {
            return scores[candidate] > scores[incumbent];
        }

        if (_publicItemCounts[candidate] != _publicItemCounts[incumbent])
        {
            return _publicItemCounts[candidate] > _publicItemCounts[incumbent];
        }

        return candidate < incumbent;
    }

    private double[] ScoreLevel(Level level, List<(string Term, double Weight)> weighted)
    {
        double[] raw = new double[level.DocLength.Length];
        foreach ((string term, double weight) in weighted)
        {
            if (!level.Terms.TryGetValue(term, out TermPostings? postings))
            {
                continue;
            }

            for (int position = 0; position < postings.Nodes.Length; position++)
            {
                int node = postings.Nodes[position];
                double tf = postings.Tf[position];
                double norm = 1 - _options.B + _options.B * (level.DocLength[node] / level.AvgDocLength);
                raw[node] += weight * postings.Idf * (tf * (_options.K1 + 1)) / (tf + _options.K1 * norm);
            }
        }

        return raw;
    }

    private static Dictionary<string, double> TaxonomyText(
        TopicTextAnalyzer analyzer,
        TopicSuggestionOptions options,
        string slug,
        string description)
    {
        Dictionary<string, double> terms = new(StringComparer.Ordinal);
        foreach (AnalyzedToken token in analyzer.Analyze(slug, trustedText: true))
        {
            Add(terms, token.Stem, options.SlugWeight);
        }

        foreach (AnalyzedToken token in analyzer.Analyze(description, trustedText: true))
        {
            Add(terms, token.Stem, options.DescriptionWeight);
        }

        return terms;
    }

    private static void Add(Dictionary<string, double> terms, string term, double amount)
    {
        terms[term] = terms.GetValueOrDefault(term) + amount;
    }

    private static Level BuildLevel(List<Dictionary<string, double>> documents)
    {
        Level level = new(documents.Count);
        Dictionary<string, List<(int Node, float Tf)>> postings = new(StringComparer.Ordinal);
        for (int node = 0; node < documents.Count; node++)
        {
            double length = 0;
            foreach ((string term, double tf) in documents[node])
            {
                length += tf;
                if (!postings.TryGetValue(term, out List<(int, float)>? list))
                {
                    list = [];
                    postings[term] = list;
                }

                list.Add((node, (float)tf));
            }

            level.DocLength[node] = length;
        }

        level.AvgDocLength = documents.Count == 0 ? 1 : Math.Max(level.DocLength.Average(), double.Epsilon);
        int count = documents.Count;
        foreach ((string term, List<(int Node, float Tf)> list) in postings)
        {
            double idf = Math.Log(1 + (count - list.Count + 0.5) / (list.Count + 0.5));
            level.Terms[term] = new TermPostings(
                list.Select(entry => entry.Node).ToArray(),
                list.Select(entry => entry.Tf).ToArray(),
                idf);
        }

        return level;
    }
}
