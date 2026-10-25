using FluentAssertions;
using Microsoft.Extensions.Logging;
using Npgsql;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>#339: the startup migration retries EMAXCONNSESSION and transient failures only.</summary>
public sealed class StartupDatabaseRetryTests
{
    private sealed class CountingLogger : ILogger
    {
        public int Warnings { get; private set; }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.Warning)
            {
                Warnings++;
            }
        }
    }

    private sealed class Probe
    {
        public int Calls { get; private set; }

        public List<TimeSpan> Delays { get; } = [];

        public CountingLogger Logger { get; } = new();

        public Task RunAsync(Func<int, Exception?> failure) => StartupDatabaseRetry.ExecuteAsync(
            _ =>
            {
                Calls++;
                Exception? ex = failure(Calls);
                return ex is null ? Task.CompletedTask : Task.FromException(ex);
            },
            Logger,
            (d, _) =>
            {
                Delays.Add(d);
                return Task.CompletedTask;
            },
            CancellationToken.None);
    }

    private static PostgresException MaxConn() => new(
        "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
        "FATAL", "FATAL", "XX000");

    private static TimeSpan S(int seconds) => TimeSpan.FromSeconds(seconds);

    [Fact]
    public async Task EMaxConnSession_ThenSuccess_RetriesWithBackoff()
    {
        Probe probe = new();

        await probe.RunAsync(n => n <= 2 ? MaxConn() : null);

        probe.Calls.Should().Be(3);
        probe.Delays.Should().Equal(S(2), S(4));
        probe.Logger.Warnings.Should().Be(2);
    }

    [Fact]
    public async Task EMaxConnSession_Always_StopsAfterSixAttempts_AndRethrowsOriginal()
    {
        Probe probe = new();
        PostgresException original = MaxConn();

        Func<Task> act = () => probe.RunAsync(_ => original);

        (await act.Should().ThrowAsync<PostgresException>()).Which.Should().BeSameAs(original);
        probe.Calls.Should().Be(6);
        probe.Delays.Should().Equal(S(2), S(4), S(8), S(16), S(30));
        probe.Logger.Warnings.Should().Be(5);
    }

    [Theory]
    [InlineData("42P01", "relation missing")]
    [InlineData("XX000", "some other internal error")]
    public async Task NonTransientPostgresError_IsNotRetried(string sqlState, string message)
    {
        Probe probe = new();

        Func<Task> act = () => probe.RunAsync(_ => new PostgresException(message, "ERROR", "ERROR", sqlState));

        await act.Should().ThrowAsync<PostgresException>();
        probe.Calls.Should().Be(1);
        probe.Delays.Should().BeEmpty();
    }

    [Theory]
    [InlineData("53300")]
    [InlineData("57P03")]
    public void TransientSqlStates_AreRetryable(string sqlState)
    {
        StartupDatabaseRetry.IsRetryable(new PostgresException("x", "FATAL", "FATAL", sqlState)).Should().BeTrue();
    }

    [Fact]
    public void TransientNpgsqlException_IsRetryable_IncludingWrapped()
    {
        NpgsqlException transient = new("x", new TimeoutException());

        StartupDatabaseRetry.IsRetryable(transient).Should().BeTrue();
        StartupDatabaseRetry.IsRetryable(new InvalidOperationException("wrapped", transient)).Should().BeTrue();
        StartupDatabaseRetry.IsRetryable(new InvalidOperationException("plain")).Should().BeFalse();
    }

    [Fact]
    public async Task Cancellation_IsNotRetried()
    {
        Probe probe = new();

        Func<Task> act = () => probe.RunAsync(_ => new OperationCanceledException());

        await act.Should().ThrowAsync<OperationCanceledException>();
        probe.Calls.Should().Be(1);
        StartupDatabaseRetry.IsRetryable(new TaskCanceledException()).Should().BeFalse();
    }
}
