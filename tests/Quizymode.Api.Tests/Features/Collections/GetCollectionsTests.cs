using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class GetCollectionsTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_WhenUserHasNoCollections_CreatesPersonalizedDefaultCollection()
    {
        User user = new()
        {
            Id = Guid.NewGuid(),
            Subject = "subject-1",
            Name = "Abcdefgh",
            Email = "abc@example.com"
        };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> userContext = new();
        userContext.SetupGet(x => x.IsAuthenticated).Returns(true);
        userContext.SetupGet(x => x.UserId).Returns(user.Id.ToString());
        userContext.SetupGet(x => x.IsAdmin).Returns(false);

        var result = await GetCollections.HandleAsync(DbContext, userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections.Should().ContainSingle();
        result.Value.Collections[0].Name.Should().Be("Abc's Collection");
        result.Value.Collections[0].Description.Should().Be("Abcdefgh default collection");

        DbContext.Collections.Should().ContainSingle(c =>
            c.CreatedBy == user.Id.ToString()
            && c.Name == "Abc's Collection"
            && c.Description == "Abcdefgh default collection");
    }

    [Fact]
    public async Task HandleAsync_WhenDisplayNameIsMissing_FallsBackToDefaultCollectionName()
    {
        User user = new()
        {
            Id = Guid.NewGuid(),
            Subject = "subject-2",
            Email = "fallback@example.com"
        };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> userContext = new();
        userContext.SetupGet(x => x.IsAuthenticated).Returns(true);
        userContext.SetupGet(x => x.UserId).Returns(user.Id.ToString());
        userContext.SetupGet(x => x.IsAdmin).Returns(false);

        var result = await GetCollections.HandleAsync(DbContext, userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections.Should().ContainSingle();
        result.Value.Collections[0].Name.Should().Be("Default Collection");
        result.Value.Collections[0].Description.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_WhenStoredNameMatchesSubject_FallsBackToDefaultCollectionName()
    {
        User user = new()
        {
            Id = Guid.NewGuid(),
            Subject = "subject-3",
            Name = "subject-3",
            Email = "subject@example.com"
        };
        DbContext.Users.Add(user);
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> userContext = new();
        userContext.SetupGet(x => x.IsAuthenticated).Returns(true);
        userContext.SetupGet(x => x.UserId).Returns(user.Id.ToString());
        userContext.SetupGet(x => x.IsAdmin).Returns(false);

        var result = await GetCollections.HandleAsync(DbContext, userContext.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Collections.Should().ContainSingle();
        result.Value.Collections[0].Name.Should().Be("Default Collection");
        result.Value.Collections[0].Description.Should().BeNull();
    }
}
