using FluentAssertions;
using FluentValidation.Results;
using Quizymode.Api.Features.StudyGuideUploads;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

public sealed class StudyGuideQuestionParserTests
{
    private static Result<List<StudyGuideGeneratedQuestion>> Parse(string raw) =>
        StudyGuideQuestionParser.Parse(raw, "Science", "biology", "plants", 20);

    [Fact]
    public void Parse_ValidObject_ReturnsQuestions()
    {
        Result<List<StudyGuideGeneratedQuestion>> result = Parse(StudyGuideUploadTestData.QuestionsJson(3));

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(3);
        result.Value[0].Question.Should().Be("What is fact 1?");
        result.Value[0].IncorrectAnswers.Should().HaveCount(3);
        result.Value[0].Explanation.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Parse_BareArrayInCodeFence_IsAccepted()
    {
        string raw = "```json\n[{\"question\":\"Q?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\",\"C\",\"D\"]}]\n```";

        Result<List<StudyGuideGeneratedQuestion>> result = Parse(raw);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().ContainSingle();
    }

    [Fact]
    public void Parse_MoreThanMax_Fails()
    {
        Parse(StudyGuideUploadTestData.QuestionsJson(21)).IsFailure.Should().BeTrue();
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{\"items\":[]}")]
    [InlineData("{\"questions\":[]}")]
    [InlineData("{\"questions\":\"nope\"}")]
    public void Parse_InvalidShape_Fails(string raw)
    {
        Result<List<StudyGuideGeneratedQuestion>> result = Parse(raw);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("StudyGuideUpload.InvalidGeneration");
    }

    [Fact]
    public void Parse_ItemMissingCorrectAnswer_FailsWholeSet()
    {
        string raw = "{\"questions\":[{\"question\":\"Q1?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\"]}," +
                     "{\"question\":\"Q2?\",\"incorrectAnswers\":[\"B\"]}]}";

        Result<List<StudyGuideGeneratedQuestion>> result = Parse(raw);

        result.IsFailure.Should().BeTrue();
        result.Error.Description.Should().Contain("correctAnswer is required");
    }

    [Fact]
    public void Parse_TooManyIncorrectAnswers_Fails()
    {
        string raw = "{\"questions\":[{\"question\":\"Q1?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\",\"C\",\"D\",\"E\",\"F\"]}]}";

        Parse(raw).IsFailure.Should().BeTrue();
    }

    [Fact]
    public void Parse_DuplicateOrCorrectEqualDistractors_AreCleanedAndQuestionKept()
    {
        string raw = "{\"questions\":[{\"question\":\"Q1?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\",\"b\",\"a\",\"C\"]}]}";

        Result<List<StudyGuideGeneratedQuestion>> result = Parse(raw);

        result.IsSuccess.Should().BeTrue();
        result.Value.Single().IncorrectAnswers.Should().Equal("B", "C");
    }

    [Fact]
    public void Parse_QuestionWithNoDistinctDistractors_IsDroppedOthersKept()
    {
        string raw = "{\"questions\":[{\"question\":\"Q1?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"a\"]}," +
                     "{\"question\":\"Q2?\",\"correctAnswer\":\"C\",\"incorrectAnswers\":[\"D\"]}]}";

        Result<List<StudyGuideGeneratedQuestion>> result = Parse(raw);

        result.IsSuccess.Should().BeTrue();
        result.Value.Select(q => q.Question).Should().Equal("Q2?");
    }

    [Fact]
    public void Parse_AllQuestionsDroppedAfterCleaning_Fails()
    {
        string raw = "{\"questions\":[{\"question\":\"Q1?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"a\"]}]}";

        Parse(raw).IsFailure.Should().BeTrue();
    }

    [Fact]
    public void Parse_DuplicateQuestions_Fails()
    {
        string raw = "{\"questions\":[{\"question\":\"Same?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\"]}," +
                     "{\"question\":\"same?\",\"correctAnswer\":\"C\",\"incorrectAnswers\":[\"D\"]}]}";

        Parse(raw).IsFailure.Should().BeTrue();
    }

    [Fact]
    public void IsBlocked_DetectsProfanityInAnyField()
    {
        List<StudyGuideGeneratedQuestion> clean = [new("Q?", "A", ["B", "C"], null)];
        List<StudyGuideGeneratedQuestion> dirty = [new("Q?", "A", ["B", "badword"], null)];

        StudyGuideQuestionParser.IsBlocked(StudyGuideUploadTestData.Moderation(), clean).Should().BeFalse();
        StudyGuideQuestionParser.IsBlocked(StudyGuideUploadTestData.Moderation(), dirty).Should().BeTrue();
    }
}

public sealed class StudyGuideUploadTextAndValidatorTests
{
    private static readonly CreateStudyGuideUpload.Validator Validator = new();

    private static CreateStudyGuideUpload.Request Request(string text, List<string>? keywords = null) =>
        new(text, "Science", "biology", "plants", keywords);

    [Fact]
    public void ComputeHash_IgnoresWhitespaceAndCase()
    {
        string a = StudyGuideUploadText.ComputeHash("Photosynthesis  uses\r\nLIGHT.");
        string b = StudyGuideUploadText.ComputeHash("  photosynthesis uses light.  ");

        a.Should().Be(b);
        a.Should().HaveLength(64).And.MatchRegex("^[0-9a-f]+$");
        StudyGuideUploadText.ComputeHash("different text").Should().NotBe(a);
    }

    [Fact]
    public void Validator_AcceptsTextUpTo10Kb()
    {
        Validator.Validate(Request(new string('a', StudyGuideUploadText.MaxTextBytes))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validator_RejectsTextOver10KbMeasuredInUtf8Bytes()
    {
        // 'é' is 2 bytes in UTF-8, so 5,121 characters exceed 10,240 bytes.
        ValidationResult result = Validator.Validate(Request(new string('é', 5121)));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("10 KB"));
    }

    [Fact]
    public void Validator_RequiresTextCategoryAndTopics()
    {
        ValidationResult result = Validator.Validate(new CreateStudyGuideUpload.Request("", "", "", "", null));

        result.IsValid.Should().BeFalse();
        result.Errors.Select(e => e.PropertyName).Should()
            .Contain(["Text", "Category", "NavigationKeyword1", "NavigationKeyword2"]);
    }

    [Fact]
    public void Validator_RejectsInvalidOrTooManyKeywords()
    {
        Validator.Validate(Request("text", ["has space!"])).IsValid.Should().BeFalse();
        Validator.Validate(Request("text", Enumerable.Range(1, 11).Select(i => $"k{i}").ToList())).IsValid.Should().BeFalse();
        Validator.Validate(Request("text", ["chapter-1", "exam"])).IsValid.Should().BeTrue();
    }

    [Fact]
    public void AcceptValidator_BoundsQuestionIndexes()
    {
        AcceptStudyGuideUpload.Validator validator = new();

        validator.Validate(new AcceptStudyGuideUpload.Request(null)).IsValid.Should().BeTrue();
        validator.Validate(new AcceptStudyGuideUpload.Request([0, 3])).IsValid.Should().BeTrue();
        validator.Validate(new AcceptStudyGuideUpload.Request([])).IsValid.Should().BeFalse();
        validator.Validate(new AcceptStudyGuideUpload.Request([20])).IsValid.Should().BeFalse();
    }
}
