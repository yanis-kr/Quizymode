using Quizymode.Api.Services.Taxonomy;

namespace Quizymode.Api.Services.Startup;

/// <summary>
/// Runs the slow startup work (migrations, taxonomy seed, dev seed) in the background so Kestrel can bind and
/// <c>/health</c> can answer straight away (#732). On success it opens the <see cref="StartupGate"/> and then warms the
/// taxonomy registry and search index. On permanent failure it logs the error and leaves the gate closed.
/// </summary>
internal sealed class StartupGateService(
    StartupGate gate,
    IEnumerable<IStartupGateStep> steps,
    IServiceProvider serviceProvider,
    ILogger<StartupGateService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Hand the thread back so the host's StartAsync (and then Kestrel's bind) never waits on this work,
        // whatever the framework does before the first await of ExecuteAsync.
        await Task.Yield();

        try
        {
            foreach (IStartupGateStep step in steps)
            {
                logger.LogInformation("Startup step {Step} started.", step.Name);
                await step.RunAsync(stoppingToken);
                logger.LogInformation("Startup step {Step} finished.", step.Name);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            gate.Fail(ex.GetType().Name);
            logger.LogError(ex, "Startup work failed; the readiness gate stays closed and /health reports unhealthy.");
            return;
        }

        gate.Open();
        logger.LogInformation("Startup gate opened.");

        WarmTaxonomy();
    }

    private void WarmTaxonomy()
    {
        try
        {
            // Both are lazy singletons; resolving them parses the taxonomy YAML so no user request pays for it.
            _ = serviceProvider.GetRequiredService<ITaxonomyRegistry>();
            _ = serviceProvider.GetService<ITaxonomySearchIndex>();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Taxonomy warm-up failed; the first request that needs it will build it.");
        }
    }
}
