using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Items.UpdateCategories;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.UpdateCategories;

public sealed class UpdateItemCategoriesValidatorTests
{
    private readonly UpdateItemCategories.Validator _validator = new();

    [Fact]
    public async Task Validate_NeitherCategoryIdNorName_Fails()
    {
        var result = await _validator.ValidateAsync(new UpdateItemCategories.Request(null, null, false));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_OnlyCategoryId_Passes()
    {
        var result = await _validator.ValidateAsync(new UpdateItemCategories.Request(Guid.NewGuid(), null, false));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_OnlyCategoryName_Passes()
    {
        var result = await _validator.ValidateAsync(new UpdateItemCategories.Request(null, "Science", true));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_CategoryNameTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new UpdateItemCategories.Request(null, new string('n', 101), false));
        result.IsValid.Should().BeFalse();
    }
}

public sealed class UpdateItemCategoriesHandlerTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(string userId, bool isAdmin = false)
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns(userId);
        ctx.Setup(x => x.IsAuthenticated).Returns(true);
        ctx.Setup(x => x.IsAdmin).Returns(isAdmin);
        return ctx;
    }

    private async Task<Item> CreateItemAsync(Guid categoryId, string createdBy = "user-1")
    {
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = "Q?",
            CorrectAnswer = "A",
            IncorrectAnswers = new List<string> { "B" },
            Explanation = "",
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            CategoryId = categoryId
        };
        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();
        return item;
    }

    [Fact]
    public async Task HandleAsync_InvalidItemId_ReturnsValidationError()
    {
        var request = new UpdateItemCategories.Request(Guid.NewGuid(), null, false);
        var userCtx = AuthenticatedUser("user-1").Object;
        var categoryResolver = Mock.Of<ICategoryResolver>();

        var result = await UpdateItemCategoriesHandler.HandleAsync(
            "not-a-guid", request, DbContext, userCtx, categoryResolver, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Item.InvalidId");
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task HandleAsync_ItemNotFound_ReturnsNotFound()
    {
        var request = new UpdateItemCategories.Request(Guid.NewGuid(), null, false);
        var userCtx = AuthenticatedUser("user-1").Object;
        var categoryResolver = Mock.Of<ICategoryResolver>();

        var result = await UpdateItemCategoriesHandler.HandleAsync(
            Guid.NewGuid().ToString(), request, DbContext, userCtx, categoryResolver, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Item.NotFound");
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_CategoryIdProvided_CategoryNotFound_ReturnsNotFound()
    {
        Category cat = new() { Id = Guid.NewGuid(), Name = "existing", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(cat);
        await DbContext.SaveChangesAsync();
        Item item = await CreateItemAsync(cat.Id);

        var request = new UpdateItemCategories.Request(Guid.NewGuid(), null, false);
        var userCtx = AuthenticatedUser("user-1").Object;
        var categoryResolver = Mock.Of<ICategoryResolver>();

        var result = await UpdateItemCategoriesHandler.HandleAsync(
            item.Id.ToString(), request, DbContext, userCtx, categoryResolver, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Category.NotFound");
    }

    [Fact]
    public async Task HandleAsync_CategoryIdProvided_PrivateCategoryNotOwned_ReturnsAccessDenied()
    {
        Category privateCat = new() { Id = Guid.NewGuid(), Name = "private-cat", IsPrivate = true, CreatedBy = "other-user", CreatedAt = DateTime.UtcNow };
        Category itemCat = new() { Id = Guid.NewGuid(), Name = "item-cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.AddRange(privateCat, itemCat);
        await DbContext.SaveChangesAsync();
        Item item = await CreateItemAsync(itemCat.Id);

        var request = new UpdateItemCategories.Request(privateCat.Id, null, false);
        var userCtx = AuthenticatedUser("current-user").Object;
        var categoryResolver = Mock.Of<ICategoryResolver>();

        var result = await UpdateItemCategoriesHandler.HandleAsync(
            item.Id.ToString(), request, DbContext, userCtx, categoryResolver, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Category.AccessDenied");
    }

    [Fact]
    public async Task HandleAsync_CategoryIdProvided_PublicCategory_UpdatesItem()
    {
        Category oldCat = new() { Id = Guid.NewGuid(), Name = "old-cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Category newCat = new() { Id = Guid.NewGuid(), Name = "new-cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.AddRange(oldCat, newCat);
        await DbContext.SaveChangesAsync();
        Item item = await CreateItemAsync(oldCat.Id);

        var request = new UpdateItemCategories.Request(newCat.Id, null, false);
        var userCtx = AuthenticatedUser("user-1").Object;
        var categoryResolver = Mock.Of<ICategoryResolver>();

        var result = await UpdateItemCategoriesHandler.HandleAsync(
            item.Id.ToString(), request, DbContext, userCtx, categoryResolver, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Category.Id.Should().Be(newCat.Id);
        result.Value.Category.Name.Should().Be("new-cat");

        Item? stored = await DbContext.Items.FindAsync(item.Id);
        stored!.CategoryId.Should().Be(newCat.Id);
    }

    [Fact]
    public async Task HandleAsync_CategoryNameProvided_CallsCategoryResolver()
    {
        Category cat = new() { Id = Guid.NewGuid(), Name = "existing", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        Category resolvedCat = new() { Id = Guid.NewGuid(), Name = "resolved-cat", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.AddRange(cat, resolvedCat);
        await DbContext.SaveChangesAsync();
        Item item = await CreateItemAsync(cat.Id);

        var categoryResolver = new Mock<ICategoryResolver>();
        categoryResolver
            .Setup(r => r.ResolveOrCreateAsync("resolved-cat", false, "user-1", false, CancellationToken.None))
            .ReturnsAsync(Result.Success(resolvedCat));

        var request = new UpdateItemCategories.Request(null, "resolved-cat", false);
        var userCtx = AuthenticatedUser("user-1").Object;

        var result = await UpdateItemCategoriesHandler.HandleAsync(
            item.Id.ToString(), request, DbContext, userCtx, categoryResolver.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Category.Name.Should().Be("resolved-cat");
    }
}
