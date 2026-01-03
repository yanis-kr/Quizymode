using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Items.GetRandom;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.GetRandom;

public sealed class GetRandomTests : ItemTestFixture
{
    private readonly Mock<IUserContext> _userContextMock;

    public GetRandomTests()
    {
        _userContextMock = new Mock<IUserContext>();
    }

    [Fact]
    public async Task HandleAsync_NoItems_ReturnsEmptyList()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);
        Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_AnonymousUser_ReturnsOnlyPublicItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item publicItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, "Test", isPrivate: false, createdBy: "test");

        Item privateItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of Spain?", "Madrid", 
            new List<string> { "Barcelona" }, "Test", isPrivate: true, createdBy: "test");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Id.Should().Be(publicItem.Id.ToString());
        result.Value.Items[0].IsPrivate.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedUser_ReturnsPublicAndOwnPrivateItems()
    {
        // Arrange
        string userId = "user123";
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        _userContextMock.Setup(x => x.UserId).Returns(userId);

        Item publicItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, "Test", isPrivate: false, createdBy: "other");

        Item ownPrivateItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of Spain?", "Madrid", 
            new List<string> { "Barcelona" }, "Test", isPrivate: true, createdBy: userId);

        Item otherPrivateItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of Italy?", "Rome", 
            new List<string> { "Milan" }, "Test", isPrivate: true, createdBy: "other");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2);
        result.Value.Items.Should().Contain(i => i.Id == publicItem.Id.ToString());
        result.Value.Items.Should().Contain(i => i.Id == ownPrivateItem.Id.ToString());
        result.Value.Items.Should().NotContain(i => i.Id == otherPrivateItem.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_WithCategoryFilter_ReturnsFilteredItems()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item geographyItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, "Test", isPrivate: false, createdBy: "test");

        Item historyItem = await CreateItemWithCategoryAsync(
            "history", "When did WW2 end?", "1945", 
            new List<string> { "1944" }, "Test", isPrivate: false, createdBy: "test");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new("geography", 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(1);
        result.Value.Items[0].Category.Should().Be("geography");
    }

    [Fact]
    public async Task HandleAsync_WithCategoryFilter_ReturnsAllItemsInCategory()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        Item franceItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of France?", "Paris", 
            new List<string> { "Lyon" }, "Test", isPrivate: false, createdBy: "test");

        Item japanItem = await CreateItemWithCategoryAsync(
            "geography", "What is the capital of Japan?", "Tokyo", 
            new List<string> { "Osaka" }, "Test", isPrivate: false, createdBy: "test");

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new("geography", 10);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(2); // Both items have geography category
        result.Value.Items.Should().Contain(i => i.Id == franceItem.Id.ToString());
        result.Value.Items.Should().Contain(i => i.Id == japanItem.Id.ToString());
    }

    [Fact]
    public async Task HandleAsync_CountLimit_RespectsRequestedCount()
    {
        // Arrange
        _userContextMock.Setup(x => x.IsAuthenticated).Returns(false);

        for (int i = 0; i < 20; i++)
        {
            await CreateItemWithCategoryAsync(
                "geography", $"Question {i}?", $"Answer {i}", 
                new List<string> { "Wrong" }, "Test", isPrivate: false, createdBy: "test");
        }

        Quizymode.Api.Features.Items.GetRandom.GetRandom.QueryRequest request = new(null, 5);

        // Act
        Result<Quizymode.Api.Features.Items.GetRandom.GetRandom.Response> result = await GetRandomHandler.HandleAsync(
            request,
            DbContext,
            _userContextMock.Object,
            CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(5);
    }

}

