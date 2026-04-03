using FluentAssertions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class UpdateCollectionTests : DatabaseTestFixture
{
    private async Task<Collection> CreateCollectionAsync(string userId, string name = "Original Name")
    {
        Collection col = new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = "Original desc",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow,
            IsPublic = false
        };
        DbContext.Collections.Add(col);
        await DbContext.SaveChangesAsync();
        return col;
    }

    private Mock<IUserContext> UserContext(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns(userId);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_UpdatesName_WhenOwner()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);

        var result = await UpdateCollection.HandleAsync(
            col.Id.ToString(),
            new UpdateCollection.Request("New Name", null, null),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Name.Should().Be("New Name");
    }

    [Fact]
    public async Task HandleAsync_UpdatesIsPublic_WhenProvided()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);

        var result = await UpdateCollection.HandleAsync(
            col.Id.ToString(),
            new UpdateCollection.Request(null, null, IsPublic: true),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.IsPublic.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ClearsDescription_WhenWhitespace()
    {
        string userId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(userId);

        var result = await UpdateCollection.HandleAsync(
            col.Id.ToString(),
            new UpdateCollection.Request(null, "   ", null),
            DbContext,
            UserContext(userId).Object,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Description.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_ReturnsNotFound_WhenCollectionDoesNotExist()
    {
        var result = await UpdateCollection.HandleAsync(
            Guid.NewGuid().ToString(),
            new UpdateCollection.Request("Name", null, null),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenNotOwner()
    {
        string ownerId = Guid.NewGuid().ToString();
        Collection col = await CreateCollectionAsync(ownerId);

        var result = await UpdateCollection.HandleAsync(
            col.Id.ToString(),
            new UpdateCollection.Request("Hijacked Name", null, null),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Collection.Forbidden");
    }

    [Fact]
    public async Task HandleAsync_ReturnsValidation_WhenIdIsNotGuid()
    {
        var result = await UpdateCollection.HandleAsync(
            "not-a-guid",
            new UpdateCollection.Request("Name", null, null),
            DbContext,
            UserContext(Guid.NewGuid().ToString()).Object,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Collection.InvalidId");
    }

    [Fact]
    public async Task Validator_FailsForEmptyName()
    {
        UpdateCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new UpdateCollection.Request("", null, null));
        vr.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validator_PassesWhenNameIsNull()
    {
        UpdateCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new UpdateCollection.Request(null, null, null));
        vr.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validator_FailsForDescriptionExceeding2000Characters()
    {
        UpdateCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new UpdateCollection.Request(null, new string('a', 2001), null));
        vr.IsValid.Should().BeFalse();
    }
}
