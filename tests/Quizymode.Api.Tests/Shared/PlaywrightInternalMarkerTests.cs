using System.Text.RegularExpressions;
using FluentAssertions;
using Xunit;

namespace Quizymode.Api.Tests.Shared;

/// <summary>
/// ANALYTICS-001 (#121): Playwright runs target production, so every spec must take <c>test</c> from
/// <c>playwright/fixtures.ts</c>, which marks each browser context as internal. A spec importing
/// <c>test</c> straight from <c>@playwright/test</c> records its visits as real visitors.
/// </summary>
public sealed class PlaywrightInternalMarkerTests
{
    // A value import of "test" (not "import type") from @playwright/test.
    private static readonly Regex DirectTestImport = new(
        @"^\s*import\s+(?!type\b)\{[^}]*\btest\b[^}]*\}\s+from\s+[""']@playwright/test[""']",
        RegexOptions.Multiline);

    [Fact]
    public void PlaywrightSpecs_UseTheInternalMarkerFixture()
    {
        string playwrightDirectory = Path.Combine(FindRepositoryRoot(), "playwright");
        string fixturesPath = Path.Combine(playwrightDirectory, "fixtures.ts");

        List<string> offenders = Directory
            .EnumerateFiles(playwrightDirectory, "*.ts", SearchOption.AllDirectories)
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}node_modules{Path.DirectorySeparatorChar}"))
            .Where(path => !string.Equals(path, fixturesPath, StringComparison.OrdinalIgnoreCase))
            .Where(path => DirectTestImport.IsMatch(File.ReadAllText(path)))
            .Select(path => Path.GetRelativePath(playwrightDirectory, path))
            .ToList();

        offenders.Should().BeEmpty("specs must import test from playwright/fixtures.ts so production runs are internal traffic");
    }

    private static string FindRepositoryRoot()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Directory.Build.props")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName
            ?? throw new InvalidOperationException("Could not locate the repository root from the test output directory.");
    }
}
