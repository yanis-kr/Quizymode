using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Features.Items.UploadToCollection;
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

    public static TheoryData<string[], string?> ConflictCases => new()
    {
        { new[] { "paris" }, QuizPlayability.IncorrectAnswerMatchesCorrectMessage },
        { new[] { " PARIS " }, QuizPlayability.IncorrectAnswerMatchesCorrectMessage },
        { new[] { "Lyon", "lyon" }, QuizPlayability.DuplicateIncorrectAnswersMessage },
        { new[] { "Lyon", " LYON ", "Nice" }, QuizPlayability.DuplicateIncorrectAnswersMessage },
        { new[] { "Lyon", "lyon", "paris" }, QuizPlayability.IncorrectAnswerMatchesCorrectMessage },
        { new[] { "Lyon", "Nice" }, null },
    };

    private static void AssertConflict(FluentValidation.Results.ValidationResult result, string? expected)
    {
        if (expected is null)
        {
            result.IsValid.Should().BeTrue();
            return;
        }

        result.IsValid.Should().BeFalse();
        result.Errors.Select(e => e.ErrorMessage).Should().Contain(expected);
    }

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
            new List<AddItemsBulk.ItemRequest> { new("Q?", "Paris", incorrect.ToList(), "E") });
        new AddItemsBulk.Validator(Admin().Object).Validate(request).IsValid.Should().Be(valid);
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public async Task UploadToCollection_Validator(string[] incorrect, bool valid)
    {
        UploadItemsToCollection.Request request = new("geo", "kw1", "kw2", [],
            new List<AddItemsBulk.ItemRequest> { new("Q?", "Paris", incorrect.ToList(), "E") }, "text");
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

    [Fact]
    public void QuizPlayability_SharedFilter_DropsBlankDuplicateAndCorrect()
    {
        QuizPlayability.GetDistractors("Paris", ["", " paris ", "Lyon", "lyon", "Nice"])
            .Should().Equal("Lyon", "Nice");
        QuizPlayability.IsPlayable("Paris", ["PARIS", "  "]).Should().BeFalse();
        QuizPlayability.IsPlayable("Paris", ["Lyon"]).Should().BeTrue();
    }

    [Theory]
    [MemberData(nameof(ConflictCases))]
    public void AddItem_Conflicts(string[] incorrect, string? expected) =>
        AssertConflict(
            new AddItem.Validator().Validate(new AddItem.Request("geo", "capitals", "europe", false, "Q?", "Paris", incorrect.ToList(), "")),
            expected);

    [Theory]
    [MemberData(nameof(ConflictCases))]
    public void UpdateItem_Conflicts(string[] incorrect, string? expected) =>
        AssertConflict(
            new UpdateItem.Validator().Validate(new UpdateItem.Request("geo", "capitals", "europe", "Q?", "Paris", incorrect.ToList(), "", false)),
            expected);

    [Theory]
    [MemberData(nameof(ConflictCases))]
    public void AddItemsBulk_Conflicts(string[] incorrect, string? expected) =>
        AssertConflict(
            new AddItemsBulk.Validator(Admin().Object).Validate(new AddItemsBulk.Request(false, "geo", "capitals", "europe", [],
                new List<AddItemsBulk.ItemRequest> { new("Q?", "Paris", incorrect.ToList(), "E") })),
            expected);

    [Theory]
    [MemberData(nameof(ConflictCases))]
    public async Task UploadToCollection_Conflicts(string[] incorrect, string? expected) =>
        AssertConflict(
            await new UploadItemsToCollection.Validator(Admin().Object).ValidateAsync(new UploadItemsToCollection.Request("geo", "kw1", "kw2", [],
                new List<AddItemsBulk.ItemRequest> { new("Q?", "Paris", incorrect.ToList(), "E") }, "text")),
            expected);

    [Theory]
    [MemberData(nameof(ConflictCases))]
    public void SeedSync_Conflicts(string[] incorrect, string? expected) =>
        AssertConflict(
            SeedSyncAdmin.ValidateManifest(new SeedSyncAdmin.ManifestRequest("set",
                [new SeedSyncAdmin.SeedItemRequest(Guid.NewGuid(), "geo", "capitals", "europe", "Q?", "Paris", incorrect.ToList())],
                [])),
            expected);

    [Theory]
    [InlineData("Paris", new[] { "paris" }, QuizPlayability.IncorrectAnswerMatchesCorrectMessage)]
    [InlineData("Paris", new[] { "Lyon", "LYON" }, QuizPlayability.DuplicateIncorrectAnswersMessage)]
    [InlineData("Paris", new[] { "Lyon", "lyon", "PARIS" }, QuizPlayability.IncorrectAnswerMatchesCorrectMessage)]
    [InlineData("Paris", new[] { "Lyon", "", "  ", "Nice" }, null)]
    [InlineData("", new[] { "Lyon" }, null)]
    [InlineData(null, new[] { "Lyon" }, null)]
    public void GetIncorrectAnswerConflict_ReturnsExpectedMessage(string? correct, string[] incorrect, string? expected) =>
        QuizPlayability.GetIncorrectAnswerConflict(correct, incorrect).Should().Be(expected);

    [Fact]
    public void GetIncorrectAnswerConflict_NullList_IsNotAConflict() =>
        QuizPlayability.GetIncorrectAnswerConflict("Paris", null).Should().BeNull();

    [Fact]
    public void Validators_NullIncorrectAnswers_DoNotThrow()
    {
        AddItem.Request request = new("geo", "capitals", "europe", false, "Q?", "Paris", null!, "");
        Action act = () => new AddItem.Validator().Validate(request);
        act.Should().NotThrow();
    }
}
