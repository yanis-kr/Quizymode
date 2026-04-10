namespace Quizymode.Api.Services;

public sealed record TurnstileVerificationResult(
    bool IsSuccess,
    string? ErrorCode = null,
    string? ErrorDetail = null);

public interface ITurnstileVerificationService
{
    Task<TurnstileVerificationResult> VerifyAsync(
        string token,
        string? remoteIp,
        CancellationToken cancellationToken);
}
