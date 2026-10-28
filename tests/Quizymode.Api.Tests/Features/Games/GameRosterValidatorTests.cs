using FluentAssertions;
using Quizymode.Api.Features.Games.GetRoster;
using Xunit;

namespace Quizymode.Api.Tests.Features.Games;

/// <summary>#381: GET /games/roster request validation (plain unit tests, no database).</summary>
public sealed class GameRosterValidatorTests
{
    private static bool IsValid(string[]? scope, int? limit = null) =>
        new GetGameRoster.Validator().Validate(new GetGameRoster.Request(scope, limit)).IsValid;

    [Fact]
    public void NoScopesAndNoLimit_IsValid() => IsValid(null).Should().BeTrue();

    [Fact]
    public void EmptyScopeArray_IsValid() => IsValid([]).Should().BeTrue();

    [Theory]
    [InlineData("science")]
    [InlineData("science/physics")]
    [InlineData("science/physics/optics")]
    [InlineData(" Science / Physics ")]
    public void WellFormedTokens_AreValid(string token) => IsValid([token]).Should().BeTrue();

    [Fact]
    public void TenScopes_AreValid() =>
        IsValid(Enumerable.Range(0, 10).Select(i => $"cat{i}").ToArray()).Should().BeTrue();

    [Fact]
    public void ElevenScopes_AreRejected() =>
        IsValid(Enumerable.Range(0, 11).Select(i => $"cat{i}").ToArray()).Should().BeFalse();

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("/physics")]
    [InlineData("science/")]
    [InlineData("science//optics")]
    [InlineData("science/ /optics")]
    public void EmptySegments_AreRejected(string token) => IsValid([token]).Should().BeFalse();

    [Fact]
    public void FourSegments_AreRejected() => IsValid(["a/b/c/d"]).Should().BeFalse();

    [Fact]
    public void SegmentOf100Chars_IsValid() => IsValid([new string('a', 100)]).Should().BeTrue();

    [Fact]
    public void SegmentOf101Chars_IsRejected() => IsValid([new string('a', 101)]).Should().BeFalse();

    [Theory]
    [InlineData(1)]
    [InlineData(200)]
    public void LimitInRange_IsValid(int limit) => IsValid(null, limit).Should().BeTrue();

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(201)]
    public void LimitOutOfRange_IsRejected(int limit) => IsValid(null, limit).Should().BeFalse();
}
