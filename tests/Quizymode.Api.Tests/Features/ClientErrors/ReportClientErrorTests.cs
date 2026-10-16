using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Quizymode.Api.Features.ClientErrors;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.ClientErrors;

public sealed class ReportClientErrorTests : DatabaseTestFixture
{
    private const string ChromeDesktop =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

    private readonly Mock<IUserContext> _userContextMock = new();
    private readonly ListLogger _logger = new();

    public ReportClientErrorTests()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(false);
        _userContextMock.SetupGet(context => context.UserId).Returns((string?)null);
    }

    private static ReportClientError.Request Valid(
        string sessionId = "session-1",
        string message = "Cannot read properties of undefined (reading 'map')",
        string? stack = "TypeError: Cannot read properties of undefined (reading 'map')\n    at CategoryList (http://localhost:7000/src/CategoryList.tsx?t=1712:12:5)\n    at renderWithHooks (http://localhost:7000/node_modules/.vite/deps/chunk-ABCD1234.js?v=9f:11548:26)",
        string source = ReportClientError.SourceBoundary,
        string path = "/categories",
        bool? internalBrowser = null) =>
        new(source, message, "TypeError", stack, "\n    at CategoryList\n    at App", path, "3.58.0", sessionId, null, internalBrowser);

    private static DefaultHttpContext HttpContext(string userAgent = ChromeDesktop)
    {
        DefaultHttpContext context = new();
        context.Request.Headers.UserAgent = userAgent;
        return context;
    }

    private Task<ReportClientError.Response> Report(ReportClientError.Request request, string userAgent = ChromeDesktop)
    {
        new ReportClientError.Validator().Validate(request).IsValid.Should().BeTrue();
        return ReportClientError.HandleAsync(
            request, HttpContext(userAgent), DbContext, _userContextMock.Object, _logger, CancellationToken.None);
    }

    [Fact]
    public async Task HandleAsync_StoresBoundaryErrorWithComponentStackPathVersionAndSession()
    {
        ReportClientError.Response response = await Report(Valid(path: "/categories/science?token=secret#frag"));

        response.Stored.Should().BeTrue();
        ClientError row = await DbContext.ClientErrors.AsNoTracking().SingleAsync();
        row.Source.Should().Be("boundary");
        row.ErrorName.Should().Be("TypeError");
        row.ComponentStack.Should().Contain("at CategoryList");
        row.Path.Should().Be("/categories/science");
        row.AppVersion.Should().Be("3.58.0");
        row.SessionId.Should().Be("session-1");
        row.Fingerprint.Should().HaveLength(32).And.Be(response.Fingerprint);
        row.UserAgent.Should().Be(ChromeDesktop);
        row.DeviceClass.Should().Be("desktop");
        row.IsBot.Should().BeFalse();
        row.IsInternal.Should().BeFalse();
        row.UserId.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_NeverStoresQueryStringsFragmentsEmailsOrTokens()
    {
        ReportClientError.Request request = Valid(
            message: "Request to https://user:pw@api.example.com/items?email=a@b.com&code=123#x failed for jane.doe@example.com with Bearer abc.def-ghi and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl");

        await Report(request);

        ClientError row = await DbContext.ClientErrors.AsNoTracking().SingleAsync();
        row.Message.Should().Be("Request to https://api.example.com/items failed for [email] with Bearer [token] and [token]");
        row.Stack.Should().NotContain("?t=").And.NotContain("?v=");
        row.Stack.Should().Contain("http://localhost:7000/src/CategoryList.tsx:12:5");
    }

    [Fact]
    public async Task HandleAsync_TruncatesOverlongFieldsInsteadOfRejecting()
    {
        ReportClientError.Request request = new(
            ReportClientError.SourceWindow,
            new string('m', 900),
            new string('n', 300),
            new string('s', 9000),
            new string('c', 5000),
            "/" + new string('p', 1000),
            "3.58.0",
            "session-long");

        (await Report(request)).Stored.Should().BeTrue();

        ClientError row = await DbContext.ClientErrors.AsNoTracking().SingleAsync();
        row.Message.Should().HaveLength(500);
        row.ErrorName.Should().HaveLength(100);
        row.Stack.Should().HaveLength(4000);
        row.ComponentStack.Should().HaveLength(2000);
        row.Path.Should().HaveLength(512);
    }

    [Fact]
    public async Task HandleAsync_StoresTheSameErrorOncePerSession()
    {
        (await Report(Valid())).Stored.Should().BeTrue();
        ReportClientError.Response again = await Report(Valid());
        ReportClientError.Response otherSession = await Report(Valid(sessionId: "session-2"));

        again.Stored.Should().BeFalse();
        again.Reason.Should().Be("duplicate");
        otherSession.Stored.Should().BeTrue();
        (await DbContext.ClientErrors.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_CapsReportsPerSession()
    {
        for (int index = 0; index < ReportClientError.MaxReportsPerSession; index++)
        {
            (await Report(Valid(message: $"distinct failure {(char)('a' + index)}", stack: null))).Stored.Should().BeTrue();
        }

        ReportClientError.Response eleventh = await Report(Valid(message: "one too many", stack: null));

        eleventh.Stored.Should().BeFalse();
        eleventh.Reason.Should().Be("session_limit");
        (await DbContext.ClientErrors.CountAsync()).Should().Be(ReportClientError.MaxReportsPerSession);
    }

    [Fact]
    public async Task HandleAsync_FlagsInternalTrafficAndBotsAtWriteTime()
    {
        Guid flaggedUserId = Guid.NewGuid();
        await DbContext.Users.AddAsync(new User { Id = flaggedUserId, Subject = "flagged", Email = "flagged@example.com", Name = "Flagged", IsInternal = true });
        await DbContext.SaveChangesAsync();

        await Report(Valid(sessionId: "marker", internalBrowser: true));
        await Report(Valid(sessionId: "bot"), userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)");

        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(true);
        _userContextMock.SetupGet(context => context.UserId).Returns(flaggedUserId.ToString());
        await Report(Valid(sessionId: "flagged-user"));

        Dictionary<string, ClientError> rows = await DbContext.ClientErrors.AsNoTracking().ToDictionaryAsync(row => row.SessionId);
        rows["marker"].IsInternal.Should().BeTrue();
        rows["bot"].IsBot.Should().BeTrue();
        rows["bot"].IsInternal.Should().BeFalse();
        rows["flagged-user"].IsInternal.Should().BeTrue();
        rows["flagged-user"].UserId.Should().Be(flaggedUserId);
        rows["flagged-user"].IsAuthenticated.Should().BeTrue();
    }

    [Fact]
    public async Task HandleAsync_WritesStructuredWarningWithFingerprintAndAppVersion()
    {
        ReportClientError.Response response = await Report(Valid());
        await Report(Valid());

        ListLogger.Entry entry = _logger.Entries.Should().ContainSingle().Subject;
        entry.Level.Should().Be(LogLevel.Warning);
        entry.Properties["ClientErrorFingerprint"].Should().Be(response.Fingerprint);
        entry.Properties["ClientAppVersion"].Should().Be("3.58.0");
        entry.Properties["ClientErrorSource"].Should().Be("boundary");
    }

    [Fact]
    public void Fingerprint_GroupsTheSameBugAcrossNumbersLineColumnsAndBundleHashes()
    {
        string first = ReportClientError.ComputeFingerprint(
            "TypeError", "Item 42 not found", "TypeError: Item 42 not found\n    at load (https://quizymode.com/assets/index-BvA9x2_q.js:1:2345)");
        string second = ReportClientError.ComputeFingerprint(
            "TypeError", "Item 77 not found", "TypeError: Item 77 not found\n    at load (https://quizymode.com/assets/index-Zq81Lmn0.js:1:9876)");
        string differentName = ReportClientError.ComputeFingerprint(
            "RangeError", "Item 42 not found", "RangeError: Item 42 not found\n    at load (https://quizymode.com/assets/index-BvA9x2_q.js:1:2345)");
        string differentFrame = ReportClientError.ComputeFingerprint(
            "TypeError", "Item 42 not found", "TypeError: Item 42 not found\n    at save (https://quizymode.com/assets/index-BvA9x2_q.js:1:2345)");

        first.Should().Be(second);
        first.Should().NotBe(differentName);
        first.Should().NotBe(differentFrame);
        first.Should().MatchRegex("^[0-9a-f]{32}$");
    }

    [Fact]
    public void TopFrame_SupportsChromeAndFirefoxFormats()
    {
        ReportClientError.TopFrame("Error: boom\n    at run (http://x.test/a.js:10:3)", "Error", "boom")
            .Should().Be("at run (http://x.test/a.js)");
        ReportClientError.TopFrame("run@http://x.test/a.js:10:3\nmain@http://x.test/b.js:1:1", "Error", "boom")
            .Should().Be("run@http://x.test/a.js");
        ReportClientError.TopFrame(null, "Error", "boom").Should().BeEmpty();
    }

    [Theory]
    [InlineData(null, "boom", "/", "s")]
    [InlineData("console", "boom", "/", "s")]
    [InlineData("window", "  ", "/", "s")]
    [InlineData("window", "boom", "https://evil.example/x", "s")]
    [InlineData("window", "boom", "//evil.example/x", "s")]
    [InlineData("window", "boom", "/", "")]
    [InlineData("window", "boom", "/", "bad session id with spaces")]
    public void Validator_RejectsInvalidPayloads(string? source, string message, string path, string sessionId)
    {
        ReportClientError.Request request = new(source, message, "Error", null, null, path, "3.58.0", sessionId);

        new ReportClientError.Validator().Validate(request).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validator_RejectsBadAppVersionAndVisitorId()
    {
        new ReportClientError.Validator().Validate(Valid() with { AppVersion = "3.58.0<script>" }).IsValid.Should().BeFalse();
        new ReportClientError.Validator().Validate(Valid() with { VisitorId = "has spaces" }).IsValid.Should().BeFalse();
        new ReportClientError.Validator().Validate(Valid() with { VisitorId = "visitor-123" }).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Prune_DeletesOnlyReportsOlderThanRetention()
    {
        DateTime now = new(2026, 10, 16, 12, 0, 0, DateTimeKind.Utc);
        await Report(Valid(sessionId: "fresh"));
        await Report(Valid(sessionId: "old"));
        await Report(Valid(sessionId: "edge"));
        await DbContext.ClientErrors.Where(row => row.SessionId == "fresh")
            .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.OccurredUtc, now.AddDays(-1)));
        await DbContext.ClientErrors.Where(row => row.SessionId == "old")
            .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.OccurredUtc, now.AddDays(-91)));
        await DbContext.ClientErrors.Where(row => row.SessionId == "edge")
            .ExecuteUpdateAsync(setters => setters.SetProperty(row => row.OccurredUtc, now.AddDays(-89)));

        int deleted = await ClientErrorCleanupService.PruneAsync(DbContext, now, CancellationToken.None);

        deleted.Should().Be(1);
        (await DbContext.ClientErrors.AsNoTracking().Select(row => row.SessionId).ToListAsync())
            .Should().BeEquivalentTo(["fresh", "edge"]);
    }

    [Theory]
    [InlineData(ChromeDesktop, "desktop", "Chrome")]
    [InlineData("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "mobile", "Safari")]
    [InlineData("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1", "tablet", "Chrome")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", "tablet", "Chrome")]
    [InlineData("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36", "mobile", "Chrome")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", "desktop", "Firefox")]
    [InlineData("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "desktop", "Edge")]
    [InlineData(null, "unknown", "Unknown")]
    public void UserAgentClassifier_BucketsDeviceAndBrowser(string? userAgent, string device, string browser)
    {
        UserAgentClassifier.DeviceClass(userAgent).Should().Be(device);
        UserAgentClassifier.BrowserFamily(userAgent).Should().Be(browser);
    }

    internal sealed class ListLogger : ILogger
    {
        public sealed record Entry(LogLevel Level, string Message, IReadOnlyDictionary<string, object?> Properties);

        public List<Entry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Dictionary<string, object?> properties = state is IEnumerable<KeyValuePair<string, object?>> pairs
                ? pairs.ToDictionary(pair => pair.Key, pair => pair.Value)
                : [];
            Entries.Add(new Entry(logLevel, formatter(state, exception), properties));
        }
    }
}
