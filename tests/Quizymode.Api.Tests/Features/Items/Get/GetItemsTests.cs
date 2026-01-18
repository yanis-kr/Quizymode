using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using GetItemsHandler = Quizymode.Api.Features.Items.Get.GetItemsHandler;

namespace Quizymode.Api.Tests.Features.Items.Get;

public sealed class GetItemsTests : ItemTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public GetItemsTests()
    {
        _userContextMock = CreateUserContextMock("test");
    }

    [Fact]
    public async Task HandleAsync_ReturnsAllItems()
    {
        // Arrange
        await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");
        await CreateItemWithCategoryAsync("geography", "Q2", "A2", new List<string>(), "", isPrivate: false, createdBy: "test");

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_FiltersByCategory()
    {
        // Arrange
        await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");
        await CreateItemWithCategoryAsync("history", "Q2", "A2", new List<string>(), "", isPrivate: false, createdBy: "test");

        GetItems.QueryRequest request = new(Category: "geography", IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Question.Should().Be("Q1");
    }

    [Fact]
    public async Task HandleAsync_PaginatesResults()
    {
        // Arrange
        for (int i = 1; i <= 15; i++)
        {
            await CreateItemWithCategoryAsync("geography", $"Q{i}", $"A{i}", new List<string>(), "", isPrivate: false, createdBy: "test");
        }

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(10);
        result.Value.TotalCount.Should().Be(15);
        result.Value.TotalPages.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_FiltersByCollectionId()
    {
        // Arrange
        Item item1 = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");
        Item item2 = await CreateItemWithCategoryAsync("geography", "Q2", "A2", new List<string>(), "", isPrivate: false, createdBy: "test");
        Item item3 = await CreateItemWithCategoryAsync("history", "Q3", "A3", new List<string>(), "", isPrivate: false, createdBy: "test");

        Collection collection = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "Test Collection",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();

        CollectionItem ci1 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item1.Id };
        CollectionItem ci2 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item2.Id };
        DbContext.CollectionItems.AddRange(ci1, ci2);
        await DbContext.SaveChangesAsync();

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: collection.Id, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().OnlyContain(i => i.Id == item1.Id.ToString() || i.Id == item2.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_WithCollectionId_CollectionNotFound_ReturnsNotFound()
    {
        // Arrange
        await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: Guid.NewGuid(), IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error!.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_WithIsRandom_ReturnsRandomItems()
    {
        // Arrange
        for (int i = 1; i <= 10; i++)
        {
            await CreateItemWithCategoryAsync("geography", $"Q{i}", $"A{i}", new List<string>(), "", isPrivate: false, createdBy: "test");
        }

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: true, Page: 1, PageSize: 5);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(5);
        result.Value.TotalCount.Should().Be(10);
        // Note: Due to randomization, we can't assert specific items, but we can verify count
    }

    [Fact]
    public async Task HandleAsync_AnonymousUser_NoCollectionsReturned()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");

        Collection collection = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "Test Collection",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();

        CollectionItem ci = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item.Id };
        DbContext.CollectionItems.Add(ci);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> anonymousUserMock = new();
        anonymousUserMock.Setup(x => x.IsAuthenticated).Returns(false);
        anonymousUserMock.Setup(x => x.UserId).Returns((string?)null);
        anonymousUserMock.Setup(x => x.IsAdmin).Returns(false);

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, anonymousUserMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Collections.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedUser_ReturnsCollectionsForUserId()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");

        Collection collection1 = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "User Collection",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        Collection collection2 = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "Other User Collection",
            CreatedBy = "other-user",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.AddRange(collection1, collection2);
        await DbContext.SaveChangesAsync();

        CollectionItem ci1 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection1.Id, ItemId = item.Id };
        CollectionItem ci2 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection2.Id, ItemId = item.Id };
        DbContext.CollectionItems.AddRange(ci1, ci2);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> userMock = CreateUserContextMock("test");
        userMock.Setup(x => x.IsAdmin).Returns(false); // Not admin, so only sees own collections

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, userMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Collections.Should().HaveCount(1);
        result.Value.Items[0].Collections[0].Name.Should().Be("User Collection");
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedUser_ReturnsOnlyOwnCollections()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");

        Collection collection1 = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "User1 Collection",
            CreatedBy = "user1",
            CreatedAt = DateTime.UtcNow
        };
        Collection collection2 = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "User2 Collection",
            CreatedBy = "user2",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.AddRange(collection1, collection2);
        await DbContext.SaveChangesAsync();

        CollectionItem ci1 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection1.Id, ItemId = item.Id };
        CollectionItem ci2 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection2.Id, ItemId = item.Id };
        DbContext.CollectionItems.AddRange(ci1, ci2);
        await DbContext.SaveChangesAsync();

        // Create a mock for user1 (not admin)
        Mock<IUserContext> user1Mock = CreateUserContextMock("user1");
        user1Mock.Setup(x => x.IsAdmin).Returns(false);

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, user1Mock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Collections.Should().HaveCount(1);
        result.Value.Items[0].Collections[0].Name.Should().Be("User1 Collection");
        result.Value.Items[0].Collections[0].Id.Should().Be(collection1.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_AdminUser_SeesAllCollections()
    {
        // Arrange
        Item item = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");

        Collection collection1 = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "User1 Collection",
            CreatedBy = "user1",
            CreatedAt = DateTime.UtcNow
        };
        Collection collection2 = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "User2 Collection",
            CreatedBy = "user2",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.AddRange(collection1, collection2);
        await DbContext.SaveChangesAsync();

        CollectionItem ci1 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection1.Id, ItemId = item.Id };
        CollectionItem ci2 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection2.Id, ItemId = item.Id };
        DbContext.CollectionItems.AddRange(ci1, ci2);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> adminMock = CreateUserContextMock("admin");
        adminMock.Setup(x => x.IsAdmin).Returns(true);

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, adminMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Collections.Should().HaveCount(2);
    }

    [Fact]
    public async Task HandleAsync_FiltersByIsPrivate()
    {
        // Arrange
        await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");
        await CreateItemWithCategoryAsync("geography", "Q2", "A2", new List<string>(), "", isPrivate: true, createdBy: "test");

        GetItems.QueryRequest request = new(Category: null, IsPrivate: false, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].IsPrivate.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_FiltersByPrivateItems_RequiresAuthentication()
    {
        // Arrange
        await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: true, createdBy: "test");

        Mock<IUserContext> anonymousUserMock = new();
        anonymousUserMock.Setup(x => x.IsAuthenticated).Returns(false);
        anonymousUserMock.Setup(x => x.UserId).Returns((string?)null);
        anonymousUserMock.Setup(x => x.IsAdmin).Returns(false);

        GetItems.QueryRequest request = new(Category: null, IsPrivate: true, Keywords: null, CollectionId: null, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, anonymousUserMock.Object, CancellationToken.None);

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error!.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public async Task HandleAsync_WithIsRandomAndCategory_FiltersAndRandomizes()
    {
        // Arrange
        for (int i = 1; i <= 10; i++)
        {
            await CreateItemWithCategoryAsync("geography", $"Q{i}", $"A{i}", new List<string>(), "", isPrivate: false, createdBy: "test");
        }
        await CreateItemWithCategoryAsync("history", "Q11", "A11", new List<string>(), "", isPrivate: false, createdBy: "test");

        GetItems.QueryRequest request = new(Category: "geography", IsPrivate: null, Keywords: null, CollectionId: null, IsRandom: true, Page: 1, PageSize: 5);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(5);
        result.Value.TotalCount.Should().Be(10);
        result.Value.Items.Should().OnlyContain(i => i.Category == "geography");
    }

    [Fact]
    public async Task HandleAsync_WithCollectionIdAndCategory_AppliesBothFilters()
    {
        // Arrange
        Item item1 = await CreateItemWithCategoryAsync("geography", "Q1", "A1", new List<string>(), "", isPrivate: false, createdBy: "test");
        Item item2 = await CreateItemWithCategoryAsync("history", "Q2", "A2", new List<string>(), "", isPrivate: false, createdBy: "test");

        Collection collection = new Collection
        {
            Id = Guid.NewGuid(),
            Name = "Test Collection",
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(collection);
        await DbContext.SaveChangesAsync();

        CollectionItem ci1 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item1.Id };
        CollectionItem ci2 = new CollectionItem { Id = Guid.NewGuid(), CollectionId = collection.Id, ItemId = item2.Id };
        DbContext.CollectionItems.AddRange(ci1, ci2);
        await DbContext.SaveChangesAsync();

        GetItems.QueryRequest request = new(Category: "geography", IsPrivate: null, Keywords: null, CollectionId: collection.Id, IsRandom: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Id.Should().Be(item1.Id.ToString());
        result.Value.Items[0].Category.Should().Be("geography");
    }

}
