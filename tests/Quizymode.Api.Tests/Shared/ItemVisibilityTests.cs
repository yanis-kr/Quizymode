using FluentAssertions;
using Quizymode.Api.Shared.Helpers;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Shared;

public sealed class ItemVisibilityTests
{
    // isPrivate, caller kind, visible, accessible by id (non-admin), accessible by id (admin)
    public static TheoryData<bool, string, bool, bool, bool> Cases => new()
    {
        { false, "owner", true, true, true },
        { false, "other", true, true, true },
        { false, "anon", true, true, true },
        { false, "empty", true, true, true },
        { true, "owner", true, true, true },
        { true, "other", false, false, true },
        { true, "anon", false, false, true },
        { true, "empty", false, false, true },
    };

    private static FakeUserContext Caller(string kind, bool admin = false) => kind switch
    {
        "owner" => new FakeUserContext(true, "owner", admin),
        "other" => new FakeUserContext(true, "other", admin),
        "empty" => new FakeUserContext(true, "", admin),
        _ => new FakeUserContext(false, null, admin)
    };

    [Theory]
    [MemberData(nameof(Cases))]
    public void TruthTable_BoolAndExpressionVersionsAgree(bool isPrivate, string callerKind, bool visible, bool accessible, bool adminAccessible)
    {
        Item item = new() { IsPrivate = isPrivate, CreatedBy = "owner" };
        FakeUserContext caller = Caller(callerKind);
        FakeUserContext admin = Caller(callerKind, admin: true);
        string? callerId = caller.IsAuthenticated ? caller.UserId : null;

        ItemVisibility.IsVisibleTo(item, callerId).Should().Be(visible);
        ItemVisibility.VisibleTo(callerId).Compile()(item).Should().Be(visible);
        ItemVisibility.CanAccessById(item, caller).Should().Be(accessible);
        ItemVisibility.AccessibleById(caller).Compile()(item).Should().Be(accessible);
        ItemVisibility.CanAccessById(item, admin).Should().Be(adminAccessible);
        ItemVisibility.AccessibleById(admin).Compile()(item).Should().Be(adminAccessible);
    }

    [Fact]
    public void EmptyCreatedBy_NeverMatchesAnonymousOrEmptyCaller()
    {
        Item item = new() { IsPrivate = true, CreatedBy = "" };

        ItemVisibility.IsVisibleTo(item, null).Should().BeFalse();
        ItemVisibility.IsVisibleTo(item, "").Should().BeFalse();
        ItemVisibility.VisibleTo(null).Compile()(item).Should().BeFalse();
        ItemVisibility.VisibleTo("").Compile()(item).Should().BeFalse();
        ItemVisibility.AccessibleById(FakeUserContext.Anonymous).Compile()(item).Should().BeFalse();
    }
}
