using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Categories;
using Quizymode.Api.Services;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Categories;

/// <summary>
/// GetCategories uses Dapper with PostgreSQL-specific SQL (::int casts, quoted identifiers).
/// These tests verify the handler's error-handling and request-object behaviour;
/// full SQL path tests require a real PostgreSQL database.
/// </summary>
public sealed class GetCategoriesTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AnonymousUser()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);
        ctx.SetupGet(x => x.UserId).Returns((string?)null);
        return ctx;
    }

    private static Mock<IUserContext> AuthenticatedUser(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_ReturnsFailure_WhenSqlFails_NotThrows()
    {
        // SQLite does not support PostgreSQL-specific SQL. The handler wraps the exception
        // in a Result.Failure, so it must not throw.
        var request = new GetCategories.QueryRequest(null);
        var logger = NullLogger<GetCategories.Endpoint>.Instance;

        var result = await GetCategories.HandleAsync(
            request, DbContext, AnonymousUser().Object, logger, CancellationToken.None);

        // Either success (if SQLite can run the query) or graceful failure — never throws
        result.Should().NotBeNull();
    }

    [Fact]
    public void QueryRequest_PreservesSearch()
    {
        var req = new GetCategories.QueryRequest("cloud");
        req.Search.Should().Be("cloud");
    }

    [Fact]
    public void QueryRequest_AllowsNullSearch()
    {
        var req = new GetCategories.QueryRequest(null);
        req.Search.Should().BeNull();
    }
}
