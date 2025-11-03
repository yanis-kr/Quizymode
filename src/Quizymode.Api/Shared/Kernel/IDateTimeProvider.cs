namespace Quizymode.Api.Shared.Kernel;

public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}

