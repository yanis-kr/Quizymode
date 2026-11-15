using FluentAssertions;
using Xunit;

namespace Quizymode.Api.Tests.Features.Taxonomy;

public sealed class LanguageExpressionsTopicTests
{
    [Theory]
    [InlineData("german")]
    [InlineData("chinese")]
    [InlineData("korean")]
    public void AC_3_11_5_LanguageDeclaresIdiomsTopicLabelledExpressions(string language)
    {
        string path = Path.Combine(AppContext.BaseDirectory, "data", "taxonomy", "quizymode_taxonomy.yaml");
        string[] lines = File.ReadAllLines(path);

        int start = Array.FindIndex(lines, line => line == $"    {language}:");
        start.Should().BeGreaterThan(-1);

        List<string> block = [];
        for (int i = start + 1; i < lines.Length && lines[i].StartsWith("      ", StringComparison.Ordinal); i++)
        {
            block.Add(lines[i]);
        }

        block.Should().Contain("        idioms: Expressions");
    }
}
