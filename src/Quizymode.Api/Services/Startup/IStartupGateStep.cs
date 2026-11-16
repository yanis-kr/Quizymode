namespace Quizymode.Api.Services.Startup;

/// <summary>One unit of slow startup work run in order by <see cref="StartupGateService"/> before the gate opens.</summary>
internal interface IStartupGateStep
{
    string Name { get; }

    Task RunAsync(CancellationToken cancellationToken);
}
