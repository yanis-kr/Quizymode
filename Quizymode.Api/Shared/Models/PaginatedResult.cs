namespace Quizymode.Api.Shared.Models;

public record PaginatedResult<T>(
    List<T>? Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages);


