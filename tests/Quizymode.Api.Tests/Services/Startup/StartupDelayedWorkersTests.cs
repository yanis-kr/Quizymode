using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Moq;
using Quizymode.Api.Features.Media;
using Quizymode.Api.Features.StudyGuideDocuments.Generation;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Startup;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.Features.Media;
using Quizymode.Api.Tests.Features.StudyGuideDocuments;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace Quizymode.Api.Tests.Services.Startup;

/// <summary>
/// Background workers must not touch the database before the startup gate opens plus their startup delay (#732).
/// A scope factory that counts <c>CreateScope</c> calls stands in for "did any work start".
/// </summary>
public sealed class StartupDelayedWorkersTests
{
    private sealed class CountingScopeFactory : IServiceScopeFactory
    {
        private int _creates;

        public int Creates => Volatile.Read(ref _creates);

        public IServiceScope CreateScope()
        {
            Interlocked.Increment(ref _creates);
            throw new InvalidOperationException("counting scope factory: no real scope");
        }
    }

    public static IEnumerable<object[]> Workers()
    {
        yield return [WorkerKind.MediaCleanup];
        yield return [WorkerKind.StudyGuideCleanup];
        yield return [WorkerKind.ClientErrorCleanup];
        yield return [WorkerKind.PageViewRetention];
        yield return [WorkerKind.StudyGuideGeneration];
        yield return [WorkerKind.AnalyticsSessionBackfill];
    }

    public enum WorkerKind
    {
        MediaCleanup,
        StudyGuideCleanup,
        ClientErrorCleanup,
        PageViewRetention,
        StudyGuideGeneration,
        AnalyticsSessionBackfill
    }

    private static (BackgroundService Worker, TimeSpan Delay) Build(WorkerKind kind, CountingScopeFactory scopes, StartupGate gate, TimeProvider time)
    {
        switch (kind)
        {
            case WorkerKind.MediaCleanup:
                Mock<IHostEnvironment> environment = new();
                environment.SetupGet(e => e.EnvironmentName).Returns(Environments.Development);
                return (new MediaCleanupWorker(
                    scopes,
                    MsOptions.Create(new MediaOptions { CleanupEnabled = true }),
                    new FakeMediaObjectStore(),
                    environment.Object,
                    gate,
                    time,
                    NullLogger<MediaCleanupWorker>.Instance), MediaCleanupWorker.StartupDelay);
            case WorkerKind.StudyGuideCleanup:
                return (new StudyGuideCleanupService(scopes, gate, time, NullLogger<StudyGuideCleanupService>.Instance), StudyGuideCleanupService.StartupDelay);
            case WorkerKind.ClientErrorCleanup:
                return (new ClientErrorCleanupService(scopes, gate, time, NullLogger<ClientErrorCleanupService>.Instance), ClientErrorCleanupService.StartupDelay);
            case WorkerKind.PageViewRetention:
                return (new PageViewRetentionService(scopes, gate, time, NullLogger<PageViewRetentionService>.Instance), PageViewRetentionService.StartupDelay);
            case WorkerKind.StudyGuideGeneration:
                return (new StudyGuideGenerationWorker(
                    scopes,
                    new LlmVendorRegistry(StudyGuideTestData.Keys()),
                    MsOptions.Create(new StudyGuideGenerationOptions()),
                    NullLogger<StudyGuideGenerationWorker>.Instance,
                    gate,
                    time), StudyGuideGenerationWorker.StartupDelay);
            default:
                // The backfill resolves its scope through an IServiceProvider, so wrap the counting factory in one.
                Mock<IServiceProvider> provider = new();
                provider.Setup(p => p.GetService(typeof(IServiceScopeFactory))).Returns(scopes);
                return (new AnalyticsSessionBackfill(
                    provider.Object,
                    gate,
                    time,
                    NullLogger<AnalyticsSessionBackfill>.Instance), AnalyticsSessionBackfill.StartupDelay);
        }
    }

    [Theory]
    [MemberData(nameof(Workers))]
    public async Task Worker_DoesNoWork_BeforeGateOpens_EvenAfterDelayElapses_ThenRunsAfterGateAndDelay(WorkerKind kind)
    {
        CountingScopeFactory scopes = new();
        StartupGate gate = new();
        FakeTimeProvider time = new();
        (BackgroundService worker, TimeSpan delay) = Build(kind, scopes, gate, time);

        await worker.StartAsync(CancellationToken.None);
        try
        {
            // Gate closed: time passing is not enough.
            time.Advance(delay + TimeSpan.FromMinutes(1));
            await Task.Delay(250);
            scopes.Creates.Should().Be(0, "no work may run while the startup gate is closed");

            // Gate open but the startup delay has not elapsed.
            gate.Open();
            await Task.Delay(250);
            scopes.Creates.Should().Be(0, "no work may run before the startup delay elapses");

            // The delay timer registers on the fake clock only after the gate wait finishes, so advance until it fires.
            DateTime deadline = DateTime.UtcNow.AddSeconds(15);
            while (scopes.Creates == 0 && DateTime.UtcNow < deadline)
            {
                time.Advance(delay + TimeSpan.FromSeconds(1));
                await Task.Delay(20);
            }

            scopes.Creates.Should().BeGreaterThan(0, "work starts once the gate is open and the delay elapsed");
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task AnalyticsSessionBackfill_StartAsyncCompletes_WhileBackfillIsStillBlockedBehindTheGate()
    {
        CountingScopeFactory scopes = new();
        (BackgroundService worker, _) = Build(WorkerKind.AnalyticsSessionBackfill, scopes, new StartupGate(), new FakeTimeProvider());

        Task start = worker.StartAsync(CancellationToken.None);

        (await Task.WhenAny(start, Task.Delay(TimeSpan.FromSeconds(5)))).Should().BeSameAs(start);
        scopes.Creates.Should().Be(0);
        await worker.StopAsync(CancellationToken.None);
    }
}

/// <summary>The media verify loop checks existence with a HEAD-style call, never by opening object content (#732).</summary>
public sealed class MediaVerifyExistenceTests : DatabaseTestFixture
{
    [Fact]
    public async Task VerifyLoop_UsesExistsAsync_AndNeverOpensContent()
    {
        DateTime now = DateTime.UtcNow;
        MediaAsset present = PictureSeed.AddAsset(DbContext, "owner");
        MediaAsset missing = PictureSeed.AddAsset(DbContext, "owner");
        await DbContext.SaveChangesAsync();
        FakeMediaObjectStore store = new();
        store.Objects[present.ObjectKey!] = [1];

        await MediaCleanupWorker.RunOnceAsync(DbContext, store, new MediaOptions { CleanupOwnerUserId = "owner" }, now, CancellationToken.None);

        store.OpenReadCalls.Should().Be(0, "existence must be checked without opening object content");
        store.ExistsCalls.Should().BeGreaterThanOrEqualTo(2);
        MediaAsset reloadedMissing = await DbContext.MediaAssets.AsNoTracking().SingleAsync(a => a.Id == missing.Id);
        MediaAsset reloadedPresent = await DbContext.MediaAssets.AsNoTracking().SingleAsync(a => a.Id == present.Id);
        reloadedMissing.DeletedAt.Should().NotBeNull("an asset whose object is gone is still revoked");
        reloadedPresent.DeletedAt.Should().BeNull();
    }
}
