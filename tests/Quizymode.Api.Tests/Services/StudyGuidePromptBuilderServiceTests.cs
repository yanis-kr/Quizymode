using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public class StudyGuidePromptBuilderServiceTests
{
    [Fact]
    public void BuildChunkPrompt_IncludesPromptSetCountAndItemRange()
    {
        var service = new StudyGuidePromptBuilderService();

        string prompt = service.BuildChunkPrompt(
            1,
            3,
            "Digestive System",
            "Food moves through the esophagus into the stomach.",
            "science",
            new[] { "anatomy", "digestive" },
            new[] { "exam-prep" },
            new[] { "What is peristalsis?" });

        prompt.Should().Contain("Generate 10 to 15 new quiz items");
        prompt.Should().Contain("prompt set 2 of 3");
        prompt.Should().Contain("Default extra keywords already applied to every imported item: exam-prep");
        prompt.Should().Contain("Already generated questions");
    }
}
