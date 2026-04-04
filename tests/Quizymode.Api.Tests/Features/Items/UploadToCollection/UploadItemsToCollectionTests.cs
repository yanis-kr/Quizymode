using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.Items.UploadToCollection;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.UploadToCollection;

public sealed class UploadItemsToCollectionTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AdminUser(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns(userId);
        ctx.Setup(x => x.IsAuthenticated).Returns(true);
        ctx.Setup(x => x.IsAdmin).Returns(true);
        return ctx;
    }

    private static string ComputeHash(string text)
    {
        byte[] hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    private static UploadItemsToCollection.Request BuildRequest(string inputText = "content") =>
        new UploadItemsToCollection.Request(
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new AddItemsBulk.ItemRequest(
                    "What is the capital of France?",
                    "Paris",
                    new List<string> { "Lyon", "Marseille", "Nice" },
                    "Paris is the capital.")
            },
            InputText: inputText);

    [Fact]
    public async Task HandleAsync_InvalidUserId_ReturnsValidationError()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns("not-a-guid");
        ctx.Setup(x => x.IsAuthenticated).Returns(true);

        var result = await UploadItemsToCollection.HandleAsync(
            BuildRequest(), DbContext, new SimHashService(), ctx.Object,
            Mock.Of<ITaxonomyItemCategoryResolver>(), Mock.Of<ITaxonomyRegistry>(),
            Mock.Of<IAuditService>(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Upload.InvalidUser");
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task HandleAsync_DuplicateContent_ReturnsConflict()
    {
        string userId = Guid.NewGuid().ToString();
        string inputText = "some duplicate content";
        string hash = ComputeHash(inputText);

        DbContext.Uploads.Add(new Upload
        {
            Id = Guid.NewGuid(),
            InputText = inputText,
            UserId = Guid.Parse(userId),
            CreatedAt = DateTime.UtcNow,
            Hash = hash
        });
        await DbContext.SaveChangesAsync();

        var result = await UploadItemsToCollection.HandleAsync(
            BuildRequest(inputText), DbContext, new SimHashService(), AdminUser(userId).Object,
            Mock.Of<ITaxonomyItemCategoryResolver>(), Mock.Of<ITaxonomyRegistry>(),
            Mock.Of<IAuditService>(), CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Upload.Duplicate");
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }
}

public sealed class UploadItemsToCollectionValidatorTests
{
    [Fact]
    public async Task Validator_EmptyCategory_Fails()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.IsAdmin).Returns(true);

        UploadItemsToCollection.Validator validator = new(ctx.Object);
        var request = new UploadItemsToCollection.Request(
            Category: "",
            Keyword1: "kw1", Keyword2: "kw2",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new AddItemsBulk.ItemRequest("Q?", "A", new List<string> { "B" }, "E")
            },
            InputText: "text");

        var result = await validator.ValidateAsync(request);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Category");
    }

    [Fact]
    public async Task Validator_EmptyItems_Fails()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.IsAdmin).Returns(false);

        UploadItemsToCollection.Validator validator = new(ctx.Object);
        var request = new UploadItemsToCollection.Request(
            Category: "geo", Keyword1: "kw1", Keyword2: "kw2",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: new List<AddItemsBulk.ItemRequest>(),
            InputText: "text");

        var result = await validator.ValidateAsync(request);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Items");
    }

    [Fact]
    public async Task Validator_NonAdminExceedsLimit_Fails()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.IsAdmin).Returns(false);

        UploadItemsToCollection.Validator validator = new(ctx.Object);
        var items = Enumerable.Range(0, 101)
            .Select(_ => new AddItemsBulk.ItemRequest("Q?", "A", new List<string> { "B" }, "E"))
            .ToList();
        var request = new UploadItemsToCollection.Request(
            Category: "geo", Keyword1: "kw1", Keyword2: "kw2",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: items,
            InputText: "text");

        var result = await validator.ValidateAsync(request);
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validator_AdminCanUploadMoreItems()
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.IsAdmin).Returns(true);

        UploadItemsToCollection.Validator validator = new(ctx.Object);
        var items = Enumerable.Range(0, 101)
            .Select(_ => new AddItemsBulk.ItemRequest("Q?", "A", new List<string> { "B", "C", "D" }, "E"))
            .ToList();
        var request = new UploadItemsToCollection.Request(
            Category: "geo", Keyword1: "kw1", Keyword2: "kw2",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: items,
            InputText: "text");

        var result = await validator.ValidateAsync(request);
        result.IsValid.Should().BeTrue();
    }
}
