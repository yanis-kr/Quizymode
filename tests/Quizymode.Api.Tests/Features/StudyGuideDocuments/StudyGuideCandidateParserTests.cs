using System.Text.Json;
using FluentAssertions;
using Quizymode.Api.Features.StudyGuideDocuments.Generation;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

public sealed class StudyGuideCandidateParserTests
{
    [Fact]
    public void QuoteMatcher_NormalizesQuotesDashesWhitespaceAndEdges()
    {
        string source = StudyGuideQuoteMatcher.Normalize("The “mitochondria” — the cell’s power-\nhouse — make ATP.");

        StudyGuideQuoteMatcher.IsSupported("...\"mitochondria\" - the cell's powerhouse - make ATP...", source).Should().BeTrue();
        StudyGuideQuoteMatcher.IsSupported("THE   \"MITOCHONDRIA\"", source).Should().BeTrue();
    }

    [Fact]
    public void QuoteMatcher_RejectsShortOrAbsentQuotes()
    {
        string source = StudyGuideQuoteMatcher.Normalize("Paris is the capital and most populous city of France.");

        StudyGuideQuoteMatcher.IsSupported("Paris is", source).Should().BeFalse("normalized quotes shorter than 15 characters are rejected");
        StudyGuideQuoteMatcher.IsSupported("Lyon is the capital of France", source).Should().BeFalse();
        StudyGuideQuoteMatcher.IsSupported(null, source).Should().BeFalse();
    }

    [Fact]
    public void Parse_KeepsOnlyQuestionsWhoseQuoteIsInTheSection()
    {
        CandidateParseResult result = StudyGuideCandidateParser.Parse(
            StudyGuideTestData.QuestionsJson(supported: 3, unsupported: 2),
            StudyGuideTestData.SectionText,
            20,
            StudyGuideTestData.Moderation());

        result.IsValidJson.Should().BeTrue();
        result.ReturnedCount.Should().Be(5);
        result.Kept.Select(candidate => candidate.CorrectAnswer).Should().Equal("Paris", "Berlin", "Madrid");
        result.DroppedCount.Should().Be(2);
        result.IsLowYield.Should().BeFalse();
    }

    [Fact]
    public void Parse_LowYieldWhenFewerThanHalfKept()
    {
        CandidateParseResult result = StudyGuideCandidateParser.Parse(
            StudyGuideTestData.QuestionsJson(supported: 1, unsupported: 3),
            StudyGuideTestData.SectionText,
            20,
            StudyGuideTestData.Moderation());

        result.Kept.Should().ContainSingle();
        result.IsLowYield.Should().BeTrue();
    }

    [Fact]
    public void Parse_DropsInvalidDuplicateAndProfaneItems()
    {
        string json = JsonSerializer.Serialize(new
        {
            questions = new object[]
            {
                new { question = "What is the capital of France?", correctAnswer = "Paris", incorrectAnswers = new[] { "Lyon" }, explanation = "x", sourceQuote = "Paris is the capital and most populous city of France" },
                new { question = "what is the capital of FRANCE?", correctAnswer = "Paris", incorrectAnswers = new[] { "Nice" }, explanation = "dup", sourceQuote = "Paris is the capital and most populous city of France" },
                new { question = "No wrong answers?", correctAnswer = "Berlin", incorrectAnswers = Array.Empty<string>(), explanation = "x", sourceQuote = "Berlin is the capital of Germany and its largest city" },
                new { question = "Wrong equals right?", correctAnswer = "Berlin", incorrectAnswers = new[] { "berlin" }, explanation = "x", sourceQuote = "Berlin is the capital of Germany and its largest city" },
                new { question = "Why badword Madrid?", correctAnswer = "Madrid", incorrectAnswers = new[] { "Rome" }, explanation = "x", sourceQuote = "Madrid is the capital of Spain and sits near the geographic center" },
                new { question = "", correctAnswer = "Rome", incorrectAnswers = new[] { "Paris" }, explanation = "x", sourceQuote = "Rome is the capital of Italy and was the center of the Roman Empire" }
            }
        });

        CandidateParseResult result = StudyGuideCandidateParser.Parse(json, StudyGuideTestData.SectionText, 20, StudyGuideTestData.Moderation());

        result.Kept.Should().ContainSingle().Which.CorrectAnswer.Should().Be("Paris");
        result.DroppedCount.Should().Be(5);
    }

    [Fact]
    public void Parse_CleansDuplicateAndCorrectEqualDistractors_KeepsQuestion()
    {
        string json = JsonSerializer.Serialize(new
        {
            questions = new object[]
            {
                new { question = "What is EC2?", correctAnswer = "Paris", incorrectAnswers = new[] { "Storage", "storage", "paris", "Network" }, explanation = "x", sourceQuote = "Paris is the capital and most populous city of France" }
            }
        });

        CandidateParseResult result = StudyGuideCandidateParser.Parse(json, StudyGuideTestData.SectionText, 20, StudyGuideTestData.Moderation());

        result.Kept.Should().ContainSingle().Which.IncorrectAnswers.Should().Equal("Storage", "Network");
    }

    [Fact]
    public void Parse_DropsOnlyQuestionLeftWithNoDistractors_KeepsSibling()
    {
        string json = JsonSerializer.Serialize(new
        {
            questions = new object[]
            {
                new { question = "Q1?", correctAnswer = "Paris", incorrectAnswers = new[] { "paris", " PARIS " }, explanation = "x", sourceQuote = "Paris is the capital and most populous city of France" },
                new { question = "Q2?", correctAnswer = "Berlin", incorrectAnswers = new[] { "Rome" }, explanation = "x", sourceQuote = "Berlin is the capital of Germany and its largest city" }
            }
        });

        CandidateParseResult result = StudyGuideCandidateParser.Parse(json, StudyGuideTestData.SectionText, 20, StudyGuideTestData.Moderation());

        result.Kept.Select(c => c.Question).Should().Equal("Q2?");
        result.DroppedCount.Should().Be(1);
    }

    [Theory]
    [InlineData("Sure! Here are your questions.")]
    [InlineData("{\"items\":[]}")]
    [InlineData("{\"questions\":\"none\"}")]
    public void Parse_InvalidShapeIsInvalidJson(string raw)
    {
        StudyGuideCandidateParser.Parse(raw, StudyGuideTestData.SectionText, 20, StudyGuideTestData.Moderation())
            .IsValidJson.Should().BeFalse();
    }

    [Fact]
    public void Parse_AcceptsCodeFencesAndCapsAtMaxQuestions()
    {
        string raw = "```json\n" + StudyGuideTestData.QuestionsJson(4) + "\n```";

        CandidateParseResult result = StudyGuideCandidateParser.Parse(raw, StudyGuideTestData.SectionText, 2, StudyGuideTestData.Moderation());

        result.Kept.Should().HaveCount(2);
        result.ReturnedCount.Should().Be(4);
    }

    [Fact]
    public void Parse_PageComesFromTheMarkerBeforeTheQuote()
    {
        string section = "[p. 12]\nParis is the capital and most populous city of France.\n\n[p. 13]\nBerlin is the capital of Germany and its largest city by population.";

        CandidateParseResult result = StudyGuideCandidateParser.Parse(
            StudyGuideTestData.QuestionsJson(supported: 2, page: 99),
            section,
            20,
            StudyGuideTestData.Moderation());

        result.Kept.Select(candidate => candidate.Page).Should().Equal(12, 13);
    }

    [Fact]
    public void Parse_TextWithoutMarkersHasNoPage()
    {
        CandidateParseResult result = StudyGuideCandidateParser.Parse(
            StudyGuideTestData.QuestionsJson(supported: 1, page: 4),
            StudyGuideTestData.SectionText,
            20,
            StudyGuideTestData.Moderation());

        result.Kept.Single().Page.Should().BeNull("a page outside the section's markers is ignored");
    }

    [Fact]
    public void PromptV2_DemandsVerbatimQuotesAndIncludesTheSection()
    {
        string prompt = StudyGuidePromptV2.BuildUserPrompt("[p. 3]\nSome text", 20);

        StudyGuidePromptV2.SystemPrompt.Should().Contain("ONLY").And.Contain("\"sourceQuote\"").And.Contain("json");
        prompt.Should().Contain("VERBATIM").And.Contain("20 to 300").And.Contain("[p. 3]").And.Contain("<study_guide_section>");
    }
}
