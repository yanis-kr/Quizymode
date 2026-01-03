using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
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

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, Page: 1, PageSize: 10);

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

        GetItems.QueryRequest request = new(Category: "geography", IsPrivate: null, Keywords: null, Page: 1, PageSize: 10);

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

        GetItems.QueryRequest request = new(Category: null, IsPrivate: null, Keywords: null, Page: 1, PageSize: 10);

        // Act
        Result<GetItems.Response> result = await GetItemsHandler.HandleAsync(request, DbContext, _userContextMock.Object, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Items.Should().HaveCount(10);
        result.Value.TotalCount.Should().Be(15);
        result.Value.TotalPages.Should().Be(2);
    }

}
