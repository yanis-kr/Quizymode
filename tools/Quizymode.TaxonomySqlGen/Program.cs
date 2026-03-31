using System.Text;
using Quizymode.Api.Shared.Taxonomy;

namespace Quizymode.TaxonomySqlGen;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        string yamlPath;
        string outPath;

        if (args.Length == 0)
        {
            string? root = FindRepoRoot();
            if (root is null)
            {
                Console.Error.WriteLine(
                    "Could not locate Quizymode.sln from the current directory. Pass --yaml and --out explicitly.");
                return 1;
            }

            yamlPath = Path.Combine(root, "docs", "quizymode_taxonomy.yaml");
            outPath = Path.Combine(root, "docs", "quizymode_taxonomy_seed.sql");
        }
        else
        {
            string? yaml = null;
            string? output = null;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--yaml" && i + 1 < args.Length)
                    yaml = args[++i];
                else if (args[i] == "--out" && i + 1 < args.Length)
                    output = args[++i];
            }

            if (yaml is null || output is null)
            {
                Console.Error.WriteLine("Usage: Quizymode.TaxonomySqlGen [--yaml <path>] [--out <path>]");
                Console.Error.WriteLine(
                    "With no arguments, resolves repo root via Quizymode.sln and writes docs/quizymode_taxonomy_seed.sql.");
                return 1;
            }

            yamlPath = yaml;
            outPath = output;
        }

        if (!File.Exists(yamlPath))
        {
            Console.Error.WriteLine($"YAML not found: {yamlPath}");
            return 1;
        }

        IReadOnlyDictionary<string, TaxonomyCategoryDefinition> categories = TaxonomyYamlParser.LoadFromFile(yamlPath);
        string sql = TaxonomySeedSqlEmitter.Generate(categories);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath))!);
        await File.WriteAllTextAsync(outPath, sql, Encoding.UTF8);
        Console.WriteLine($"Wrote {outPath} ({categories.Count} categories).");
        return 0;
    }

    private static string? FindRepoRoot()
    {
        DirectoryInfo? dir = new(Directory.GetCurrentDirectory());
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "Quizymode.sln")))
                return dir.FullName;
            dir = dir.Parent;
        }

        return null;
    }
}
