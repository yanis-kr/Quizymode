using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class AddOrUpdateCollectionRatingTests : DatabaseTestFixture
{
    private async Task<Collection> CreatePublicCollectionAsync(string userId)
    {
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Rated Collection",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow,
            IsPublic = true
        };
        DbContext.Collections.Add(col);
        await DbContext.SaveChangesAsync();
        return col;
    }

    private Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_CreatesRating_WhenNoneExists()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreatePublicCollectionAsync(userId);

        var result = await AddOrUpdateCollectionRating.HandleAsync(
            col.Id,
            new AddOrUpdateCollectionRating.Request(4),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Stars.Should().Be(4);
        result.Value.CollectionId.Should().Be(col.Id);
    }

    [Fact]
    public async Task HandleAsync_UpdatesRating_WhenAlreadyRated()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreatePublicCollectionAsync(userId);

        // First rating
        await AddOrUpdateCollectionRating.HandleAsync(
            col.Id,
            new AddOrUpdateCollectionRating.Request(3),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        // Update rating
        var result = await AddOrUpdateCollectionRating.HandleAsync(
            col.Id,
            new AddOrUpdateCollectionRating.Request(5),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Stars.Should().Be(5);
        result.Value.UpdatedAt.Should().NotBeNull();
        DbContext.CollectionRatings.Should().ContainSingle(r => r.CollectionId == col.Id && r.CreatedBy == userId);
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        var result = await AddOrUpdateCollectionRating.HandleAsync(
            Guid.NewGuid(),
            new AddOrUpdateCollectionRating.Request(3),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task Validator_FailsForStarsLessThanOne()
    {
        AddOrUpdateCollectionRating.Validator validator = new();
        var vr = await validator.ValidateAsync(new AddOrUpdateCollectionRating.Request(0));
        vr.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validator_FailsForStarsMoreThanFive()
    {
        AddOrUpdateCollectionRating.Validator validator = new();
        var vr = await validator.ValidateAsync(new AddOrUpdateCollectionRating.Request(6));
        vr.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validator_PassesForValidStars()
    {
        AddOrUpdateCollectionRating.Validator validator = new();
        for (int i = 1; i <= 5; i++)
        {
            var vr = await validator.ValidateAsync(new AddOrUpdateCollectionRating.Request(i));
            vr.IsValid.Should().BeTrue();
        }
    }
}

public sealed class GetCollectionRatingTests : DatabaseTestFixture
{
    private async Task<Collection> CreateCollectionAsync(string userId)
    {
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = "Test",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(col);
        await DbContext.SaveChangesAsync();
        return col;
    }

    [Fact]
    public async Task HandleAsync_ReturnsZeroCount_WhenNoRatings()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);

        var result = await GetCollectionRating.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Count.Should().Be(0);
        result.Value.AverageStars.Should().BeNull();
        result.Value.MyStars.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ReturnsAverageRating_WhenRatingsExist()
    {
        string ownerId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(ownerId);

        DbContext.CollectionRatings.AddRange(
            new CollectionRating { Id = Guid.NewGuid(), CollectionId = col.Id, Stars = 4, CreatedBy = "u1", CreatedAt = DateTime.UtcNow },
            new CollectionRating { Id = Guid.NewGuid(), CollectionId = col.Id, Stars = 2, CreatedBy = "u2", CreatedAt = DateTime.UtcNow });
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);

        var result = await GetCollectionRating.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Count.Should().Be(2);
        result.Value.AverageStars.Should().Be(3.0);
    }

    [Fact]
    public async Task HandleAsync_ReturnsMyStars_WhenUserRated()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync("owner");

        DbContext.CollectionRatings.Add(new CollectionRating
        {
            Id = Guid.NewGuid(),
            CollectionId = col.Id,
            Stars = 5,
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow
        });
        await DbContext.SaveChangesAsync();

        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);

        var result = await GetCollectionRating.HandleAsync(col.Id, DbContext, ctx.Object, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.MyStars.Should().Be(5);
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(false);

        var result = await GetCollectionRating.HandleAsync(Guid.NewGuid(), DbContext, ctx.Object, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }
}
