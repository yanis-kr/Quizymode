using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>#328: pure decision logic for the UserUpsertMiddleware cheap path.</summary>
public sealed class UserUpsertSkipDecisionTests
{
    private const string Subject = "sub-1";

    private static readonly DateTime Now = new(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);

    private static bool CanSkip(int ageSeconds, string? storedEmail, string? claimEmail, string? storedName, string claimName)
    {
        UserUpsertMiddleware.UserLoginSnapshot snapshot = new(
            Guid.NewGuid(), Subject, storedEmail, storedName, Now.AddSeconds(-ageSeconds));
        return UserUpsertMiddleware.CanSkipUpsert(snapshot, claimEmail, claimName, Now);
    }

    [Theory]
    // LastLogin age boundaries (refresh interval is 5 minutes, exclusive)
    [InlineData(0, "a@x.com", "a@x.com", "custom", "custom", true)]
    [InlineData(299, "a@x.com", "a@x.com", "custom", "custom", true)]
    [InlineData(300, "a@x.com", "a@x.com", "custom", "custom", false)]
    [InlineData(301, "a@x.com", "a@x.com", "custom", "custom", false)]
    [InlineData(-1, "a@x.com", "a@x.com", "custom", "custom", false)]
    // Email must match exactly, including case and null
    [InlineData(60, "A@x.com", "a@x.com", "custom", "custom", false)]
    [InlineData(60, "a@x.com", "b@x.com", "custom", "custom", false)]
    [InlineData(60, null, null, "custom", "custom", true)]
    [InlineData(60, null, "a@x.com", "custom", "custom", false)]
    [InlineData(60, "a@x.com", null, "custom", "custom", false)]
    // Default name (null, blank or equal to the subject) is refreshed from the claim
    [InlineData(60, "a@x.com", "a@x.com", Subject, Subject, true)]
    [InlineData(60, "a@x.com", "a@x.com", Subject, "Alice", false)]
    [InlineData(60, "a@x.com", "a@x.com", null, "Alice", false)]
    [InlineData(60, "a@x.com", "a@x.com", " ", "Alice", false)]
    [InlineData(60, "a@x.com", "a@x.com", "Alice", "Alice", true)]
    // A customised name is never overwritten, so a different claim does not block the skip
    [InlineData(60, "a@x.com", "a@x.com", "My Name", "Alice", true)]
    public void CanSkipUpsert_FollowsEmailNameAndAgeRules(
        int ageSeconds, string? storedEmail, string? claimEmail, string? storedName, string claimName, bool expected)
    {
        CanSkip(ageSeconds, storedEmail, claimEmail, storedName, claimName).Should().Be(expected);
    }

    [Fact]
    public void RefreshInterval_IsShorterThanAuditDebounce()
    {
        UserUpsertMiddleware.LastLoginRefreshInterval.Should().BeLessThan(UserUpsertMiddleware.LoginAuditDebounce);
    }

    [Theory]
    [InlineData(601)]
    [InlineData(3600)]
    [InlineData(86400)]
    public void CanSkipUpsert_NeverSkipsARequestThatWouldWriteAnAudit(int ageSeconds)
    {
        // Any age beyond the audit debounce must take the locked path so the LoginSuccess is written.
        ageSeconds.Should().BeGreaterThan((int)UserUpsertMiddleware.LoginAuditDebounce.TotalSeconds);
        CanSkip(ageSeconds, "a@x.com", "a@x.com", "custom", "custom").Should().BeFalse();
    }
}
