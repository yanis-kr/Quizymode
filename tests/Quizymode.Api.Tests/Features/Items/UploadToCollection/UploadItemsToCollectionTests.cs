using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
            Mock.Of<IAuditService>(), Mock.Of<ITextModerationService>(), CancellationToken.None);

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
            Mock.Of<IAuditService>(), Mock.Of<ITextModerationService>(), CancellationToken.None);

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

    [Fact]
    public void Validator_NullItems_ReturnsItemsRequiredError()
    {
        Mock<IUserContext> ctx = new();
        UploadItemsToCollection.Validator validator = new(ctx.Object);
        UploadItemsToCollection.Request request = new(
            Category: "geo", Keyword1: "kw1", Keyword2: "kw2",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: null!,
            InputText: "text");

        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage == "Items is required");
        result.Errors.Should().NotContain(e => e.ErrorMessage == "At least one item is required");
    }
}

public sealed class UploadItemsToCollectionCollectionNameTests : ItemTestFixture
{
    private readonly string _userId = Guid.NewGuid().ToString();

    private static ITextModerationService Moderation()
    {
        Mock<ITextModerationService> moderation = new();
        moderation.Setup(m => m.Evaluate(It.IsAny<string?[]>()))
            .Returns((string?[] values) => values.Any(v => v is not null && v.Contains("badword"))
                ? new TextModerationResult(TextModerationOutcome.Blocked, "badword")
                : new TextModerationResult(TextModerationOutcome.Clean));
        return moderation.Object;
    }

    private static UploadItemsToCollection.Request Build(string? collectionName, string inputText = "content") =>
        new(
            Category: "geography",
            Keyword1: "capitals",
            Keyword2: "europe",
            Keywords: new List<AddItemsBulk.KeywordRequest>(),
            Items: new List<AddItemsBulk.ItemRequest>
            {
                new("What is the capital of France?", "Paris", new List<string> { "Lyon", "Marseille", "Nice" }, "Paris is the capital.")
            },
            InputText: inputText,
            CollectionName: collectionName);

    private async Task<Result<UploadItemsToCollection.Response>> UploadAsync(UploadItemsToCollection.Request request, bool isAdmin = true)
    {
        await EnsureGeographyPublicWithNavAsync(_userId);
        Mock<IUserContext> ctx = CreateUserContextMock(_userId);
        ctx.Setup(x => x.IsAdmin).Returns(isAdmin);
        return await UploadItemsToCollection.HandleAsync(
            request, DbContext, SimHashService, ctx.Object, TaxonomyItemCategoryResolver, TaxonomyRegistry,
            Mock.Of<IAuditService>(), Moderation(), CancellationToken.None);
    }

    [Fact]
    public async Task HandleAsync_CollectionName_IsTrimmedAndUsed()
    {
        var result = await UploadAsync(Build("  My Capitals  "));

        result.IsSuccess.Should().BeTrue(result.IsFailure ? result.Error!.Description : null);
        result.Value!.Name.Should().Be("My Capitals");
        (await DbContext.Collections.SingleAsync(c => c.Id == Guid.Parse(result.Value.CollectionId))).Name.Should().Be("My Capitals");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task HandleAsync_BlankCollectionName_FallsBackToGuidName(string? name)
    {
        var result = await UploadAsync(Build(name));

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().MatchRegex("^[0-9a-f]{32}$");
    }

    [Fact]
    public async Task HandleAsync_BlockedCollectionName_FailsBeforeAnythingIsWritten()
    {
        var result = await UploadAsync(Build("my badword list"));

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Upload.CollectionNameBlocked");
        result.Error.Type.Should().Be(ErrorType.Validation);
        (await DbContext.Uploads.CountAsync()).Should().Be(0);
        (await DbContext.Items.CountAsync()).Should().Be(0);
        (await DbContext.Collections.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_NonAdminWithName_StillCreatesPrivateItems()
    {
        var result = await UploadAsync(Build("Mine"), isAdmin: false);

        result.IsSuccess.Should().BeTrue();
        (await DbContext.Items.SingleAsync()).IsPrivate.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_NameIsNotPartOfTheHash_SameContentWithDifferentNameIsDuplicate()
    {
        (await UploadAsync(Build("First"))).IsSuccess.Should().BeTrue();

        var second = await UploadAsync(Build("Second"));

        second.IsFailure.Should().BeTrue();
        second.Error!.Code.Should().Be("Upload.Duplicate");
    }

    [Fact]
    public void Validator_CollectionNameOver200AfterTrim_Fails()
    {
        Mock<IUserContext> ctx = new();
        UploadItemsToCollection.Validator validator = new(ctx.Object);

        validator.Validate(Build(new string('a', 201))).Errors.Should().Contain(e => e.PropertyName == "CollectionName");
        validator.Validate(Build(" " + new string('a', 200) + " ")).IsValid.Should().BeTrue();
        validator.Validate(Build("   ")).IsValid.Should().BeTrue();
    }
}

public sealed class UploadItemsToCollectionHttpTests : ItemTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        await EnsureGeographyPublicWithNavAsync("seeder");
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddScoped<FluentValidation.IValidator<UploadItemsToCollection.Request>, UploadItemsToCollection.Validator>();
                services.AddSingleton(SimHashService);
                services.AddSingleton(TaxonomyRegistry);
                services.AddScoped<ITaxonomyItemCategoryResolver>(provider =>
                    new TaxonomyItemCategoryResolver(provider.GetRequiredService<Quizymode.Api.Data.ApplicationDbContext>(), TaxonomyRegistry));
                Mock<ITextModerationService> moderation = new();
                moderation.Setup(m => m.Evaluate(It.IsAny<string?[]>()))
                    .Returns((string?[] values) => values.Any(v => v is not null && v.Contains("badword"))
                        ? new TextModerationResult(TextModerationOutcome.Blocked, "badword")
                        : new TextModerationResult(TextModerationOutcome.Clean));
                services.AddSingleton(moderation.Object);
            },
            app => new UploadItemsToCollection.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<HttpResponseMessage> PostAsync(string collectionName)
    {
        string json = System.Text.Json.JsonSerializer.Serialize(new
        {
            category = "geography",
            keyword1 = "capitals",
            keyword2 = "europe",
            keywords = Array.Empty<object>(),
            items = new[] { new { question = "What is the capital of France?", correctAnswer = "Paris", incorrectAnswers = new[] { "Lyon" }, explanation = "" } },
            inputText = "http-content",
            collectionName
        });
        using StringContent content = new(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, "/items/upload-to-collection", _host.CreateToken("uploader", "uploader@example.com"), content);
        return await _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task Post_BlockedCollectionName_Returns400AndSavesNothing()
    {
        using HttpResponseMessage response = await PostAsync("my badword list");

        response.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().Contain("Upload.CollectionNameBlocked");
        DbContext.Uploads.Count().Should().Be(0);
        DbContext.Items.Count().Should().Be(0);
        DbContext.Collections.Count().Should().Be(0);
    }

    [Fact]
    public async Task Post_CollectionNameOver200Chars_Returns400()
    {
        using HttpResponseMessage response = await PostAsync(new string('a', 201));

        response.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        DbContext.Uploads.Count().Should().Be(0);
    }
}
