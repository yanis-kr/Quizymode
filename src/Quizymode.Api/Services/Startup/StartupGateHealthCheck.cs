using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Quizymode.Api.Services.Startup;

/// <summary>Readiness check "startup-gate": Unhealthy until the gate opens, Healthy afterwards (one-way).</summary>
internal sealed class StartupGateHealthCheck(StartupGate gate) : IHealthCheck
{
    public const string Name = "startup-gate";
    public const string ReadyTag = "ready";

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (gate.IsOpen)
        {
            return Task.FromResult(HealthCheckResult.Healthy("Startup work finished."));
        }

        string description = gate.FailureReason is { } reason
            ? $"Startup work failed: {reason}"
            : "Startup work (migrations and seed) is still running.";
        return Task.FromResult(HealthCheckResult.Unhealthy(description));
    }
}
