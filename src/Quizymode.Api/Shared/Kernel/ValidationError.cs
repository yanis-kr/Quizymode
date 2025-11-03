namespace Quizymode.Api.Shared.Kernel;

public record ValidationError(string PropertyName, string ErrorMessage, string ErrorCode);

