using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Npgsql;
using Quizymode.Api.Shared;
using Xunit;

namespace Quizymode.Api.Tests.Shared;

public sealed class DbConnectionFailureLoggerTests
{
    private sealed class Ctx(DbContextOptions<Ctx> o) : DbContext(o)
    {
        public DbSet<Row> Rows => Set<Row>();
    }

    private sealed class Row
    {
        public int Id { get; set; }
    }

    private sealed class FakeLogger(List<(LogLevel Level, string Message)> lines) : ILogger<DbConnectionFailureLogger>
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => lines.Add((logLevel, formatter(state, exception)));
    }

    [Fact]
    public async Task ConnectionFailure_LogsWarningWithExceptionAndRequestId_NoPassword()
    {
        List<(LogLevel Level, string Message)> lines = [];
        FakeLogger logger = new(lines);

        DefaultHttpContext http = new() { TraceIdentifier = "req-123" };
        Mock<IHttpContextAccessor> accessor = new();
        accessor.Setup(a => a.HttpContext).Returns(http);

        DbContextOptions<Ctx> options = new DbContextOptionsBuilder<Ctx>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=x;Username=u;Password=secret-pw;Timeout=2")
            .AddInterceptors(new DbConnectionFailureLogger(accessor.Object, logger))
            .Options;

        await using Ctx ctx = new(options);
        Func<Task> act = () => ctx.Rows.ToListAsync();
        await act.Should().ThrowAsync<Exception>();

        lines.Should().Contain(l => l.Level == LogLevel.Warning
            && l.Message.Contains("req-123") && l.Message.Contains("Exception"));
        lines.Should().NotContain(l => l.Message.Contains("secret-pw"));
    }
}
