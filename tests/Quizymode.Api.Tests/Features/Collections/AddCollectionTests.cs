using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Services;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class AddCollectionTests : DatabaseTestFixture
{
    private static Mock<IUserContext> AuthenticatedUser(string userId)
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.IsAuthenticated).Returns(true);
        ctx.SetupGet(x => x.UserId).Returns(userId);
        return ctx;
    }

    [Fact]
    public async Task HandleAsync_CreatesCollection_WhenRequestIsValid()
    {
        string userId = Guid.NewGuid().ToString();
        AddCollection.Request request = new("My Collection", "A test collection", IsPublic: false);

        var result = await AddCollection.HandleAsync(
            request,
            DbContext,
            AuthenticatedUser(userId).Object,
            NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Name.Should().Be("My Collection");
        result.Value.Description.Should().Be("A test collection");
        result.Value.IsPublic.Should().BeFalse();

        DbContext.Collections.Should().ContainSingle(c => c.Name == "My Collection" && c.CreatedBy == userId);
    }

    [Fact]
    public async Task HandleAsync_DefaultsIsPublicToFalse_WhenNotProvided()
    {
        string userId = Guid.NewGuid().ToString();
        AddCollection.Request request = new("My Collection");

        var result = await AddCollection.HandleAsync(
            request,
            DbContext,
            AuthenticatedUser(userId).Object,
            NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.IsPublic.Should().BeFalse();
    }

    [Fact]
    public async Task HandleAsync_CreatesPublicCollection_WhenIsPublicTrue()
    {
        string userId = Guid.NewGuid().ToString();
        AddCollection.Request request = new("Public Collection", IsPublic: true);

        var result = await AddCollection.HandleAsync(
            request,
            DbContext,
            AuthenticatedUser(userId).Object,
            NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.IsPublic.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_ReturnsFailure_WhenUserIdIsNull()
    {
        Mock<IUserContext> ctx = new();
        ctx.SetupGet(x => x.UserId).Returns((string?)null);

        var result = await AddCollection.HandleAsync(
            new AddCollection.Request("Name"),
            DbContext,
            ctx.Object,
            NullLogger<AddCollection.Endpoint>.Instance,
            CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Collections.UserIdMissing");
    }

    [Fact]
    public async Task Validator_PassesForValidRequest()
    {
        AddCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new AddCollection.Request("Valid Name"));
        vr.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validator_FailsForEmptyName()
    {
        AddCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new AddCollection.Request(""));
        vr.IsValid.Should().BeFalse();
        vr.Errors.Should().Contain(e => e.PropertyName == "Name");
    }

    [Fact]
    public async Task Validator_FailsForNameExceeding200Characters()
    {
        AddCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new AddCollection.Request(new string('a', 201)));
        vr.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validator_FailsForDescriptionExceeding2000Characters()
    {
        AddCollection.Validator validator = new();
        var vr = await validator.ValidateAsync(new AddCollection.Request("Valid", new string('a', 2001)));
        vr.IsValid.Should().BeFalse();
    }
}
