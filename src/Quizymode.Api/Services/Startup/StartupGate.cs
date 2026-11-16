namespace Quizymode.Api.Services.Startup;

/// <summary>
/// One-way readiness gate (#732). It is closed at boot and opened by <see cref="StartupGateService"/> once migrations,
/// the taxonomy seed and the dev seed are done. Kestrel binds and <c>/health</c> answers while it is closed, so slow
/// startup work never blocks the container health probe. If the startup work fails for good the gate stays closed
/// and <see cref="FailureReason"/> says why.
/// </summary>
internal sealed class StartupGate
{
    private readonly TaskCompletionSource _opened = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private volatile string? _failureReason;

    public bool IsOpen => _opened.Task.IsCompletedSuccessfully;

    /// <summary>Set when the startup work failed permanently; the gate then never opens.</summary>
    public string? FailureReason => _failureReason;

    public void Open() => _opened.TrySetResult();

    public void Fail(string reason) => _failureReason = reason;

    /// <summary>Completes when the gate opens. Never completes if the gate fails; cancel through <paramref name="cancellationToken"/>.</summary>
    public Task WaitUntilOpenAsync(CancellationToken cancellationToken) => _opened.Task.WaitAsync(cancellationToken);

    /// <summary>
    /// Waits for the gate, then for <paramref name="startupDelay"/>, so a background job never competes with the first
    /// probes or runs against an unmigrated schema. A null <paramref name="gate"/> skips the gate wait (tests that build a worker directly).
    /// </summary>
    public static async Task WaitThenDelayAsync(
        StartupGate? gate,
        TimeSpan startupDelay,
        TimeProvider? timeProvider,
        CancellationToken cancellationToken)
    {
        if (gate is not null)
        {
            await gate.WaitUntilOpenAsync(cancellationToken);
        }

        if (startupDelay > TimeSpan.Zero)
        {
            await Task.Delay(startupDelay, timeProvider ?? TimeProvider.System, cancellationToken);
        }
    }
}
