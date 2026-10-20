using System.Text.Json;
using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Features.Items.UploadToCollection;
using Quizymode.Api.Features.StudyGuideImport;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>#250: every create/update path requires 1 to 4 non-blank incorrect answers.</summary>
public sealed class IncorrectAnswersRuleTests
{
    public static TheoryData<string[], bool> Cases => new()
    {
        { Array.Empty<string>(), false },
        { new[] { "A" }, true },
        { new[] { "A", "B", "C", "D" }, true },
        { new[] { "A", "B", "C", "D", "E" }, false },
        { new[] { "A", "" }, false },
        { new[] { "A", "   " }, false },
    };

    private static Mock<IUserContext> Admin()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns("u");
        ctx.Setup(x => x.IsAuthenticated).Returns(true);
        ctx.Setup(x => x.IsAdmin).Returns(true);
        return ctx;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void AddItem_Validator(string[] incorrect, bool valid)
    {
        AddItem.Request request = new("geo", "capitals", "europe", false, "Q?", "Paris", incorrect.ToList(), "");
        new AddItem.Validator().Validate(request).IsValid.Should().Be(valid);
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void UpdateItem_Validator(string[] incorrect, bool valid)
    {
        UpdateItem.Request request = new("geo", "capitals", "europe", "Q?", "Paris", incorrect.ToList(), "", false);
        new UpdateItem.Validator().Validate(request).IsValid.Should().Be(valid);
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void AddItemsBulk_Validator(string[] incorrect, bool valid)
    {
        AddItemsBulk.Request request = new(false, "geo", "capitals", "europe", [],
            new List<AddItemsBulk.ItemRequest> { new("Q?", "A", incorrect.ToList(), "E") });
        new AddItemsBulk.Validator(Admin().Object).Validate(request).IsValid.Should().Be(valid);
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task UploadToCollection_Validator(string[] incorrect, bool valid)
    {
        UploadItemsToCollection.Request request = new("geo", "kw1", "kw2", [],
            new List<AddItemsBulk.ItemRequest> { new("Q?", "A", incorrect.ToList(), "E") }, "text");
        var result = await new UploadItemsToCollection.Validator(Admin().Object).ValidateAsync(request);
        result.IsValid.Should().Be(valid);
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void SeedSync_Validator(string[] incorrect, bool valid)
    {
        SeedSyncAdmin.ManifestRequest manifest = new("set",
            [new SeedSyncAdmin.SeedItemRequest(Guid.NewGuid(), "geo", "capitals", "europe", "Q?", "Paris", incorrect.ToList())],
            []);
        SeedSyncAdmin.ValidateManifest(manifest).IsValid.Should().Be(valid);
    }

    [Theory]
    [InlineData("""["A"]""", true)]
    [InlineData("""["A","   "]""", false)]
    [InlineData("""[]""", false)]
    [InlineData("""["A","B","C","D","E"]""", false)]
    public void StudyGuideItemValidator_RejectsBlankAndOutOfRange(string incorrectJson, bool valid)
    {
        string json = $$"""[{"question":"What is EC2?","correctAnswer":"Compute","incorrectAnswers":{{incorrectJson}}}]""";
        using JsonDocument doc = JsonDocument.Parse(json);
        List<JsonElement> array = doc.RootElement.EnumerateArray().Select(e => e.Clone()).ToList();

        var (isValid, messages, _, _) = StudyGuideItemValidator.ValidateAndMap(array, "exams", new[] { "aws", "saa" }, new());

        isValid.Should().Be(valid);
        if (incorrectJson.Contains("   ")) messages.Should().Contain(m => m.Contains("cannot be blank"));
    }

    [Fact]
    public void QuizPlayability_SharedFilter_DropsBlankDuplicateAndCorrect()
    {
        QuizPlayability.GetDistractors("Paris", ["", " paris ", "Lyon", "lyon", "Nice"])
            .Should().Equal("Lyon", "Nice");
        QuizPlayability.IsPlayable("Paris", ["PARIS", "  "]).Should().BeFalse();
        QuizPlayability.IsPlayable("Paris", ["Lyon"]).Should().BeTrue();
    }
}
