using FluentAssertions;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>
/// #326: legacy Languages navigation paths are no longer rewritten at startup, so the taxonomy
/// itself must reject them at ingest. Uses the real taxonomy YAML.
/// </summary>
public sealed class LegacyLanguagesNavigationTests : ItemTestFixture
{
    [Theory]
    [InlineData("esl", "beginner")]
    [InlineData("esl", "grammar")]
    [InlineData("general", "mixed")]
    [InlineData("grammar", "grammar")]
    [InlineData("vocab", "vocab")]
    [InlineData("idioms", "idioms")]
    [InlineData("travel", "travel")]
    [InlineData("mixed", "mixed")]
    [InlineData("other-langs", "english")]
    [InlineData("other-langs", "spanish")]
    [InlineData("other-langs", "french")]
    [InlineData("other-langs", "german")]
    [InlineData("other-langs", "italian")]
    [InlineData("other-langs", "russian")]
    [InlineData("other-langs", "japanese")]
    [InlineData("other-langs", "latvian")]
    [InlineData("other-langs", "ukrainian")]
    [InlineData("other-langs", "bulgarian")]
    [InlineData("other-langs", "romanian")]
    [InlineData("other-langs", "latin")]
    public void IsValidNavigationPath_RetiredLanguagesPath_IsFalse(string nav1, string nav2)
    {
        TaxonomyRegistry.IsValidNavigationPath("languages", nav1, nav2).Should().BeFalse();
    }

    [Theory]
    [InlineData("english", "core")]
    [InlineData("english", "grammar")]
    [InlineData("other-langs", "mixed")]
    [InlineData("latin", "expressions")]
    public void IsValidNavigationPath_CurrentLanguagesPath_IsTrue(string nav1, string nav2)
    {
        TaxonomyRegistry.IsValidNavigationPath("languages", nav1, nav2).Should().BeTrue();
    }
}
