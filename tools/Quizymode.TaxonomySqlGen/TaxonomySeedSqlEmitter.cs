using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Quizymode.Taxonomy;

namespace Quizymode.TaxonomySqlGen;

internal static class TaxonomySeedSqlEmitter
{
    private const string SeederUser = "seeder";
    private const string SeedTimestampUtc = "2024-01-01 00:00:00+00";
    private const string OtherDescription = "Items not in a specific subcategory.";

    internal static string Generate(IReadOnlyDictionary<string, TaxonomyCategoryDefinition> categories)
    {
        StringBuilder sb = new();
        sb.AppendLine("""
            -- GENERATED FILE — DO NOT EDIT BY HAND.
            -- Regenerate after changing docs/quizymode_taxonomy.yaml:
            --   dotnet run --project tools/Quizymode.TaxonomySqlGen
            --
            """);

        List<(string Slug, string Description, string ShortDesc)> categoryRows = [];
        foreach (string slug in categories.Keys.OrderBy(s => s, StringComparer.Ordinal))
        {
            TaxonomyCategoryDefinition def = categories[slug];
            categoryRows.Add((slug, def.Description, ShortDescriptionFromCategory(def.Description)));
        }

        foreach ((string slug, string description, string shortDesc) in categoryRows)
        {
            Guid id = DeterministicGuid($"taxonomy:category:{slug}");
            sb.AppendLine(
                $"""
                INSERT INTO "Categories" ("Id", "Name", "Description", "ShortDescription", "IsPrivate", "CreatedBy", "CreatedAt")
                VALUES ({PgUuid(id)}, {PgString(slug)}, {PgString(Truncate(description, 500))}, {PgString(Truncate(shortDesc, 120))}, false, {PgString(SeederUser)}, timestamptz {PgString(SeedTimestampUtc)})
                ON CONFLICT ("Name") DO UPDATE SET
                  "Description" = EXCLUDED."Description",
                  "ShortDescription" = EXCLUDED."ShortDescription";
                """);
        }

        HashSet<string> keywordNames = new(StringComparer.OrdinalIgnoreCase) { "other" };
        foreach (TaxonomyCategoryDefinition def in categories.Values)
        {
            foreach (TaxonomyL1Group l1 in def.L1Groups)
            {
                keywordNames.Add(l1.Slug);
                foreach (TaxonomyL2Leaf l2 in l1.L2Leaves)
                    keywordNames.Add(l2.Slug);
            }
        }

        foreach (string name in keywordNames.OrderBy(n => n, StringComparer.Ordinal))
        {
            Guid kid = DeterministicGuid($"taxonomy:keyword:public:{SeederUser}:{name}");
            string slug = TaxonomyKeywordSlug.FromName(name);
            if (string.IsNullOrEmpty(slug))
                slug = name;
            slug = Truncate(slug, 30);
            sb.AppendLine(
                $"""
                INSERT INTO "Keywords" ("Id", "Name", "Slug", "IsPrivate", "CreatedBy", "CreatedAt", "IsReviewPending")
                VALUES ({PgUuid(kid)}, {PgString(Truncate(name, 30))}, {PgString(slug)}, false, {PgString(SeederUser)}, timestamptz {PgString(SeedTimestampUtc)}, false)
                ON CONFLICT ("Name", "CreatedBy", "IsPrivate") DO UPDATE SET
                  "Slug" = COALESCE("Keywords"."Slug", EXCLUDED."Slug");
                """);
        }

        foreach (string catSlug in categories.Keys.OrderBy(s => s, StringComparer.Ordinal))
        {
            TaxonomyCategoryDefinition def = categories[catSlug];
            Guid otherRelId = DeterministicGuid($"taxonomy:kr:{catSlug}::other");
            sb.AppendLine(
                $"""
                INSERT INTO "KeywordRelations" ("Id", "CategoryId", "ParentKeywordId", "ChildKeywordId", "SortOrder", "Description", "IsPrivate", "CreatedBy", "IsReviewPending", "CreatedAt")
                SELECT {PgUuid(otherRelId)}, c."Id", NULL, k."Id", 0, {PgString(OtherDescription)}, false, NULL, false, timestamptz {PgString(SeedTimestampUtc)}
                FROM "Categories" c
                JOIN "Keywords" k ON k."Name" = 'other' AND k."IsPrivate" = false AND k."CreatedBy" = {PgString(SeederUser)}
                WHERE c."Name" = {PgString(catSlug)}
                ON CONFLICT ("CategoryId", "ParentKeywordId", "ChildKeywordId") DO UPDATE SET
                  "Description" = EXCLUDED."Description",
                  "SortOrder" = EXCLUDED."SortOrder";
                """);

            for (int i = 0; i < def.L1Groups.Count; i++)
            {
                TaxonomyL1Group l1 = def.L1Groups[i];
                int sortRank = i + 1;
                string? l1Desc = string.IsNullOrWhiteSpace(l1.Description) ? null : l1.Description;
                Guid l1RelId = DeterministicGuid($"taxonomy:kr:{catSlug}::{l1.Slug}");
                sb.AppendLine(
                    $"""
                    INSERT INTO "KeywordRelations" ("Id", "CategoryId", "ParentKeywordId", "ChildKeywordId", "SortOrder", "Description", "IsPrivate", "CreatedBy", "IsReviewPending", "CreatedAt")
                    SELECT {PgUuid(l1RelId)}, c."Id", NULL, k."Id", {sortRank.ToString(CultureInfo.InvariantCulture)}, {PgNullableString(l1Desc is null ? null : Truncate(l1Desc, 500))}, false, NULL, false, timestamptz {PgString(SeedTimestampUtc)}
                    FROM "Categories" c
                    JOIN "Keywords" k ON k."Name" = {PgString(l1.Slug)} AND k."IsPrivate" = false AND k."CreatedBy" = {PgString(SeederUser)}
                    WHERE c."Name" = {PgString(catSlug)}
                    ON CONFLICT ("CategoryId", "ParentKeywordId", "ChildKeywordId") DO UPDATE SET
                      "Description" = EXCLUDED."Description",
                      "SortOrder" = EXCLUDED."SortOrder";
                    """);

                for (int j = 0; j < l1.L2Leaves.Count; j++)
                {
                    TaxonomyL2Leaf l2 = l1.L2Leaves[j];
                    string? l2Desc = string.IsNullOrWhiteSpace(l2.Description) ? null : l2.Description;
                    Guid l2RelId = DeterministicGuid($"taxonomy:kr:{catSlug}:{l1.Slug}:{l2.Slug}");
                    sb.AppendLine(
                        $"""
                        INSERT INTO "KeywordRelations" ("Id", "CategoryId", "ParentKeywordId", "ChildKeywordId", "SortOrder", "Description", "IsPrivate", "CreatedBy", "IsReviewPending", "CreatedAt")
                        SELECT {PgUuid(l2RelId)}, c."Id", pk."Id", ck."Id", {j.ToString(CultureInfo.InvariantCulture)}, {PgNullableString(l2Desc is null ? null : Truncate(l2Desc, 500))}, false, NULL, false, timestamptz {PgString(SeedTimestampUtc)}
                        FROM "Categories" c
                        JOIN "Keywords" ck ON ck."Name" = {PgString(l2.Slug)} AND ck."IsPrivate" = false AND ck."CreatedBy" = {PgString(SeederUser)}
                        JOIN "Keywords" pk ON pk."Name" = {PgString(l1.Slug)} AND pk."IsPrivate" = false AND pk."CreatedBy" = {PgString(SeederUser)}
                        WHERE c."Name" = {PgString(catSlug)}
                        ON CONFLICT ("CategoryId", "ParentKeywordId", "ChildKeywordId") DO UPDATE SET
                          "Description" = EXCLUDED."Description",
                          "SortOrder" = EXCLUDED."SortOrder";
                        """);
                }
            }
        }

        return sb.ToString();
    }

    private static string ShortDescriptionFromCategory(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return "";
        string[] words = description.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        string joined = words.Length <= 5 ? string.Join(" ", words) : string.Join(" ", words.Take(5));
        return Truncate(joined, 120);
    }

    private static string Truncate(string s, int max)
    {
        if (s.Length <= max)
            return s;
        return s[..max];
    }

    private static string PgString(string s) => "'" + s.Replace("'", "''", StringComparison.Ordinal) + "'";

    private static string PgNullableString(string? s) => s is null ? "NULL" : PgString(s);

    private static string PgUuid(Guid g) => "'" + g.ToString("D", CultureInfo.InvariantCulture) + "'::uuid";

    /// <summary>Stable UUIDs so codegen output diffs stay predictable (not used for FK — relations resolve IDs via JOIN).</summary>
    private static Guid DeterministicGuid(string input)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        Span<byte> b = stackalloc byte[16];
        hash.AsSpan(0, 16).CopyTo(b);
        b[6] = (byte)((b[6] & 0x0F) | 0x40);
        b[8] = (byte)((b[8] & 0x3F) | 0x80);
        return new Guid(b);
    }
}
