using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Moq;
using Quizymode.Api.Services.Startup;
using Quizymode.Api.StartupExtensions;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services.Startup;

/// <summary>
/// Startup gate (#732): Kestrel binds and the probes answer while slow startup work is still running; other requests
/// get 503 + Retry-After until the gate opens. Runs a real Kestrel host in the Production environment.
/// </summary>
public sealed class StartupGateTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    [Fact]
    public async Task ClosedGate_AliveIs200_HealthIs503_ThenBothAre200AfterOpen()
    {
        TaskCompletionSource release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        await using GateHost host = await GateHost.StartAsync([new DelegateStep("blocked", _ => release.Task)]);

        (await host.Client.GetAsync("/alive")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await host.Client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);

        release.SetResult();
        await host.WaitUntilOpenAsync();

        (await host.Client.GetAsync("/alive")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await host.Client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ClosedGate_NormalRequestGets503WithRetryAfter_ThenSucceedsAfterOpen()
    {
        TaskCompletionSource release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        await using GateHost host = await GateHost.StartAsync([new DelegateStep("blocked", _ => release.Task)]);

        HttpResponseMessage closed = await host.Client.GetAsync("/api/ping");
        closed.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        closed.Headers.RetryAfter.Should().NotBeNull();
        closed.Headers.RetryAfter!.Delta.Should().Be(TimeSpan.FromSeconds(StartupGateMiddleware.RetryAfterSeconds));

        release.SetResult();
        await host.WaitUntilOpenAsync();

        (await host.Client.GetAsync("/api/ping")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task HostStartsAndAliveAnswers_WhileMigrationStepIsStillBlocked()
    {
        TaskCompletionSource migrationStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        TaskCompletionSource releaseMigration = new(TaskCreationOptions.RunContinuationsAsynchronously);
        CountingMigrator migrator = new(async () =>
        {
            migrationStarted.SetResult();
            await releaseMigration.Task;
        });

        // StartAsync returning proves Kestrel bound and hosted services started without waiting for the migration.
        await using GateHost host = await GateHost.StartAsync(
            [new MigrationStartupStep(migrator, new LoggerFactory().CreateLogger<MigrationStartupStep>())]);
        await migrationStarted.Task.WaitAsync(Timeout);

        host.Gate.IsOpen.Should().BeFalse();
        (await host.Client.GetAsync("/alive")).StatusCode.Should().Be(HttpStatusCode.OK);

        releaseMigration.SetResult();
        await host.WaitUntilOpenAsync();
    }

    [Fact]
    public async Task MigrateIsCalledExactlyOncePerBoot()
    {
        CountingMigrator migrator = new(() => Task.CompletedTask);
        int laterStepRuns = 0;

        await using GateHost host = await GateHost.StartAsync(
        [
            new MigrationStartupStep(migrator, new LoggerFactory().CreateLogger<MigrationStartupStep>()),
            new DelegateStep("seed", _ => { laterStepRuns++; return Task.CompletedTask; })
        ]);
        await host.WaitUntilOpenAsync();

        migrator.Calls.Should().Be(1, "migrations run exactly once per boot");
        laterStepRuns.Should().Be(1);
    }

    [Fact]
    public async Task PermanentFailure_KeepsGateClosed_HealthStays503_AliveStays200_AndLogsError()
    {
        CapturingLoggerProvider logs = new();
        await using GateHost host = await GateHost.StartAsync(
            [new DelegateStep("boom", _ => throw new InvalidOperationException("migration failed"))], logs);

        await PollAsync(() => host.Gate.FailureReason is not null);

        host.Gate.IsOpen.Should().BeFalse();
        (await host.Client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await host.Client.GetAsync("/alive")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await host.Client.GetAsync("/api/ping")).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        logs.Entries.Should().Contain(e => e.Level == LogLevel.Error && e.Exception is InvalidOperationException);
    }

    [Fact]
    public async Task TaxonomyRegistry_IsBuiltAfterGateOpens_WithoutAnyRequest()
    {
        int registryBuilds = 0;
        await using GateHost host = await GateHost.StartAsync(
            [],
            configureServices: services => services.AddSingleton<ITaxonomyRegistry>(_ =>
            {
                Interlocked.Increment(ref registryBuilds);
                return new Mock<ITaxonomyRegistry>().Object;
            }));

        await host.WaitUntilOpenAsync();
        await PollAsync(() => Volatile.Read(ref registryBuilds) > 0);

        registryBuilds.Should().Be(1);
    }

    [Fact]
    public async Task TaxonomyRegistry_IsNotBuiltBeforeGateOpens()
    {
        TaskCompletionSource release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        int registryBuilds = 0;
        await using GateHost host = await GateHost.StartAsync(
            [new DelegateStep("blocked", _ => release.Task)],
            configureServices: services => services.AddSingleton<ITaxonomyRegistry>(_ =>
            {
                Interlocked.Increment(ref registryBuilds);
                return new Mock<ITaxonomyRegistry>().Object;
            }));

        await Task.Delay(300);
        Volatile.Read(ref registryBuilds).Should().Be(0);

        release.SetResult();
        await host.WaitUntilOpenAsync();
    }

    [Fact]
    public async Task BackgroundServiceExecuteAsync_WithBlockingSynchronousStart_DoesNotBlockHostStart()
    {
        // Documents the framework behavior in question: does StartAsync of a BackgroundService return even when
        // ExecuteAsync does synchronous blocking work before its first await?
        using ManualResetEventSlim release = new(false);
        BlockingService service = new(release);

        Task start = Task.Run(() => service.StartAsync(CancellationToken.None));
        Task winner = await Task.WhenAny(start, Task.Delay(TimeSpan.FromSeconds(3)));
        bool startReturned = winner == start;
        release.Set();
        await service.StopAsync(CancellationToken.None);

        startReturned.Should().BeTrue("StartAsync must not wait for ExecuteAsync's synchronous prefix");
    }

    [Fact]
    public void Gate_WaitUntilOpen_CompletesOnlyAfterOpen()
    {
        StartupGate gate = new();
        Task wait = gate.WaitUntilOpenAsync(CancellationToken.None);

        wait.IsCompleted.Should().BeFalse();
        gate.Open();
        wait.IsCompletedSuccessfully.Should().BeTrue();
        gate.IsOpen.Should().BeTrue();
    }

    private static async Task PollAsync(Func<bool> condition)
    {
        DateTime deadline = DateTime.UtcNow + Timeout;
        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException("Condition was not met in time.");
            }

            await Task.Delay(20);
        }
    }

    private sealed class CountingMigrator(Func<Task> run) : IStartupMigrator
    {
        private int _calls;

        public int Calls => Volatile.Read(ref _calls);

        public Task MigrateAsync(CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _calls);
            return run();
        }
    }

    private sealed class BlockingService(ManualResetEventSlim release) : BackgroundService
    {
        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            release.Wait(TimeSpan.FromSeconds(10));
            return Task.CompletedTask;
        }
    }

    private sealed class DelegateStep(string name, Func<CancellationToken, Task> run) : IStartupGateStep
    {
        public string Name => name;

        public Task RunAsync(CancellationToken cancellationToken) => run(cancellationToken);
    }

    private sealed class GateHost : IAsyncDisposable
    {
        private readonly WebApplication _app;

        private GateHost(WebApplication app, StartupGate gate, HttpClient client)
        {
            _app = app;
            Gate = gate;
            Client = client;
        }

        public StartupGate Gate { get; }

        public HttpClient Client { get; }

        public static async Task<GateHost> StartAsync(
            IEnumerable<IStartupGateStep> steps,
            CapturingLoggerProvider? logs = null,
            Action<IServiceCollection>? configureServices = null)
        {
            WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = Environments.Production
            });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            if (logs is not null)
            {
                builder.Logging.AddProvider(logs);
            }

            StartupGate gate = new();
            builder.Services.AddSingleton(gate);
            builder.Services.AddHealthChecks()
                .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"])
                .AddCheck<StartupGateHealthCheck>(StartupGateHealthCheck.Name, tags: [StartupGateHealthCheck.ReadyTag]);
            foreach (IStartupGateStep step in steps)
            {
                builder.Services.AddSingleton<IStartupGateStep>(step);
            }

            configureServices?.Invoke(builder.Services);
            builder.Services.AddHostedService<StartupGateService>();

            WebApplication app = builder.Build();
            app.UseMiddleware<StartupGateMiddleware>();
            app.MapDefaultEndpoints();
            app.MapGet("/api/ping", () => Results.Ok("pong"));

            await app.StartAsync().WaitAsync(Timeout);

            string address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
            HttpClient client = new() { BaseAddress = new Uri(address) };
            return new GateHost(app, gate, client);
        }

        public Task WaitUntilOpenAsync() => Gate.WaitUntilOpenAsync(CancellationToken.None).WaitAsync(Timeout);

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }
}
