using Microsoft.Extensions.Hosting;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Shared.Taxonomy;

namespace Quizymode.Api.Services.Taxonomy;

internal static class TaxonomyYamlLoader
{
    public static IReadOnlyDictionary<string, TaxonomyCategoryDefinition> Load(
        IHostEnvironment environment,
        TaxonomyOptions options)
    {
        string path = ResolveYamlPath(environment, options);
        return TaxonomyYamlParser.LoadFromFile(path);
    }

    /// <summary>
    /// Resolves YAML: <see cref="TaxonomyOptions.YamlRelativePath"/> under content root, then under
    /// <see cref="AppContext.BaseDirectory"/> (build output) so <c>dotnet run</c> finds the file copied by the csproj.
    /// </summary>
    public static string ResolveYamlPath(IHostEnvironment environment, TaxonomyOptions options)
    {
        return ResolveDataFilePath(environment, options.YamlRelativePath);
    }

    public static string ResolveSeedSqlPath(IHostEnvironment environment, TaxonomyOptions options)
    {
        return ResolveDataFilePath(environment, options.SeedSqlRelativePath);
    }

    private static string ResolveDataFilePath(IHostEnvironment environment, string relative)
    {
        if (Path.IsPathRooted(relative))
        {
            if (!File.Exists(relative))
                throw new FileNotFoundException($"Taxonomy data file not found at '{relative}'.");
            return relative;
        }

        string[] roots = [environment.ContentRootPath, AppContext.BaseDirectory];
        foreach (string root in roots)
        {
            string candidate = Path.GetFullPath(Path.Combine(root, relative));
            if (File.Exists(candidate))
                return candidate;
        }

        throw new FileNotFoundException(
            $"Taxonomy data file not found. Tried relative path '{relative}' under content root '{environment.ContentRootPath}' " +
            $"and base directory '{AppContext.BaseDirectory}'.");
    }
}
