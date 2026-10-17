using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>#201: link access (IsPublic) and Discover listing (IsDiscoverable) are separate; Discover requires both.</summary>
public sealed class CollectionDiscoverabilityTests : DatabaseTestFixture
{
    private static readonly string UserId = Guid.NewGuid().ToString();

    private static IUserContext Owner()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(UserId);
        return ctx.Object;
    }

    private async Task<AddCollection.Response> AddAsync(bool? isPublic, bool? isDiscoverable) =>
        (await AddCollection.HandleAsync(
            new AddCollection.Request("Mine", null, isPublic, isDiscoverable),
            DbContext,
            Owner(),
            NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None)).Value;

    [Theory]
    [InlineData(null, null, false, false)]
    [InlineData(true, null, true, false)]
    [InlineData(true, true, true, true)]
    [InlineData(false, true, false, false)]
    [InlineData(null, true, false, false)]
    public async Task Add_DefaultsToNotDiscoverableAndRequiresPublic(bool? isPublic, bool? isDiscoverable, bool expectedPublic, bool expectedDiscoverable)
    {
        AddCollection.Response response = await AddAsync(isPublic, isDiscoverable);

        response.IsPublic.Should().Be(expectedPublic);
        response.IsDiscoverable.Should().Be(expectedDiscoverable);
        (await DbContext.Collections.SingleAsync()).IsDiscoverable.Should().Be(expectedDiscoverable);
    }

    [Fact]
    public async Task Update_TurningLinkAccessOffAlsoTurnsDiscoverOff()
    {
        AddCollection.Response created = await AddAsync(true, true);

        var result = await UpdateCollection.HandleAsync(created.Id, new UpdateCollection.Request(null, null, IsPublic: false), DbContext, Owner(), CancellationToken.None);

        result.Value.IsPublic.Should().BeFalse();
        result.Value.IsDiscoverable.Should().BeFalse();
    }

    [Fact]
    public async Task Update_DiscoverableOnlyTakesEffectWhenPublic()
    {
        AddCollection.Response created = await AddAsync(false, null);

        var ignored = await UpdateCollection.HandleAsync(created.Id, new UpdateCollection.Request(null, null, null, IsDiscoverable: true), DbContext, Owner(), CancellationToken.None);
        var both = await UpdateCollection.HandleAsync(created.Id, new UpdateCollection.Request(null, null, true, IsDiscoverable: true), DbContext, Owner(), CancellationToken.None);
        var unlisted = await UpdateCollection.HandleAsync(created.Id, new UpdateCollection.Request(null, null, null, IsDiscoverable: false), DbContext, Owner(), CancellationToken.None);
        var omitted = await UpdateCollection.HandleAsync(created.Id, new UpdateCollection.Request("Renamed", null, null), DbContext, Owner(), CancellationToken.None);

        ignored.Value.IsDiscoverable.Should().BeFalse();
        both.Value.IsDiscoverable.Should().BeTrue();
        unlisted.Value.IsPublic.Should().BeTrue();
        unlisted.Value.IsDiscoverable.Should().BeFalse();
        omitted.Value.IsDiscoverable.Should().BeFalse("omitting isDiscoverable leaves it unchanged");
    }

    [Fact]
    public async Task ListAndGet_ReturnIsDiscoverable()
    {
        AddCollection.Response created = await AddAsync(true, true);

        var list = await GetCollections.HandleAsync(DbContext, Owner(), CancellationToken.None);
        var get = await GetCollectionById.HandleAsync(Guid.Parse(created.Id), DbContext, Owner(), CancellationToken.None);

        list.Value.Collections.Single().IsDiscoverable.Should().BeTrue();
        get.Value.IsDiscoverable.Should().BeTrue();
    }

    [Fact]
    public void DefaultCollection_IsPrivateAndNotDiscoverable()
    {
        Collection collection = DefaultCollectionFactory.Create(UserId, "Someone");

        collection.IsPublic.Should().BeFalse();
        collection.IsDiscoverable.Should().BeFalse();
    }
}
