using FluentAssertions;
using Moq;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Helpers;

public sealed class ItemWriteAccessTests
{
    private static IUserContext User(string? userId, bool isAdmin = false, bool isAuthenticated = true)
    {
        Mock<IUserContext> ctx = new();
        ctx.Setup(x => x.UserId).Returns(userId);
        ctx.Setup(x => x.IsAdmin).Returns(isAdmin);
        ctx.Setup(x => x.IsAuthenticated).Returns(isAuthenticated);
        return ctx.Object;
    }

    private static Item ItemOf(string createdBy, bool isPrivate) =>
        new() { Id = Guid.NewGuid(), CreatedBy = createdBy, IsPrivate = isPrivate };

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Check_Owner_IsAllowed(bool isPrivate)
    {
        ItemWriteAccess.Check(ItemOf("u1", isPrivate), User("u1"), "x").Should().BeNull();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Check_Admin_IsAllowedOnAnyItem(bool isPrivate)
    {
        ItemWriteAccess.Check(ItemOf("u1", isPrivate), User("admin", isAdmin: true), "x").Should().BeNull();
    }

    [Fact]
    public void Check_NonOwnerPrivate_IsNotFound()
    {
        Error? error = ItemWriteAccess.Check(ItemOf("u1", true), User("u2"), "abc");

        error.Should().NotBeNull();
        error!.Type.Should().Be(ErrorType.NotFound);
        error.Code.Should().Be("Item.NotFound");
        error.Description.Should().Be("Item with id abc not found");
    }

    [Fact]
    public void Check_NonOwnerPublic_IsForbidden()
    {
        Error? error = ItemWriteAccess.Check(ItemOf("u1", false), User("u2"), "abc");

        error.Should().NotBeNull();
        error!.Code.Should().Be(ItemWriteAccess.ForbiddenCode);
    }

    [Fact]
    public void Check_NullUserId_IsNotOwner()
    {
        ItemWriteAccess.Check(ItemOf("u1", false), User(null), "x")!.Code.Should().Be(ItemWriteAccess.ForbiddenCode);
        ItemWriteAccess.Check(ItemOf("u1", true), User(null), "x")!.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public void Check_EmptyUserIdMatchingEmptyCreatedBy_IsNotOwner()
    {
        ItemWriteAccess.CanModify(ItemOf("", false), User("")).Should().BeFalse();
    }

    [Fact]
    public void Check_UnauthenticatedWithMatchingId_IsNotOwner()
    {
        ItemWriteAccess.CanModify(ItemOf("u1", false), User("u1", isAuthenticated: false)).Should().BeFalse();
    }

    [Fact]
    public void Check_OwnerComparisonIsCaseSensitive()
    {
        ItemWriteAccess.CanModify(ItemOf("U1", false), User("u1")).Should().BeFalse();
    }
}
