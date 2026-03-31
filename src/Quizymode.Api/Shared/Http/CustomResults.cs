using Microsoft.Extensions.Logging;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Shared.Http;

public static class CustomResults
{
    /// <summary>
    /// Returns a ProblemDetails result for a failed <see cref="Result"/>.
    /// When <paramref name="logger"/> is provided, logs the error details (code, description, status).
    /// </summary>
    public static IResult Problem(Result result, ILogger? logger = null)
    {
        if (result.IsSuccess)
        {
            throw new InvalidOperationException();
        }

        int statusCode = GetStatusCode(result.Error.Type);
        if (logger is not null)
        {
            if (statusCode >= 500)
                logger.LogError("Request failed: Code={Code}, Detail={Detail}, StatusCode={StatusCode}",
                    result.Error.Code, result.Error.Description, statusCode);
            else
                logger.LogWarning("Request failed: Code={Code}, Detail={Detail}, StatusCode={StatusCode}",
                    result.Error.Code, result.Error.Description, statusCode);
        }

        return Results.Problem(
            title: GetTitle(result.Error),
            detail: GetDetail(result.Error),
            type: GetType(result.Error.Type),
            statusCode: statusCode);

        static int GetStatusCode(ErrorType errorType) =>
            errorType switch
            {
                ErrorType.Validation or ErrorType.Problem => StatusCodes.Status400BadRequest,
                ErrorType.NotFound => StatusCodes.Status404NotFound,
                ErrorType.Conflict => StatusCodes.Status409Conflict,
                _ => StatusCodes.Status500InternalServerError
            };

        static string GetTitle(Error error) =>
            error.Type switch
            {
                ErrorType.Validation => error.Code,
                ErrorType.Problem => error.Code,
                ErrorType.NotFound => error.Code,
                ErrorType.Conflict => error.Code,
                _ => "Server failure"
            };

        static string GetDetail(Error error) =>
            error.Type switch
            {
                ErrorType.Validation => error.Description,
                ErrorType.Problem => error.Description,
                ErrorType.NotFound => error.Description,
                ErrorType.Conflict => error.Description,
                _ => "An unexpected error occurred"
            };

        static string GetType(ErrorType errorType) =>
            errorType switch
            {
                ErrorType.Validation => "https://tools.ietf.org/html/rfc7231#section-6.5.1",
                ErrorType.Problem => "https://tools.ietf.org/html/rfc7231#section-6.5.1",
                ErrorType.NotFound => "https://tools.ietf.org/html/rfc7231#section-6.5.4",
                ErrorType.Conflict => "https://tools.ietf.org/html/rfc7231#section-6.5.8",
                _ => "https://tools.ietf.org/html/rfc7231#section-6.6.1"
            };
    }

    public static IResult BadRequest(string detail, string? title = null)
    {
        return Results.Problem(
            title: title ?? "Bad Request",
            detail: detail,
            type: "https://tools.ietf.org/html/rfc7231#section-6.5.1",
            statusCode: StatusCodes.Status400BadRequest);
    }

    public static IResult Unauthorized(string? detail = null)
    {
        return Results.Problem(
            title: "Unauthorized",
            detail: detail ?? "Authentication required",
            type: "https://tools.ietf.org/html/rfc7235#section-3.1",
            statusCode: StatusCodes.Status401Unauthorized);
    }

    public static IResult NotFound(string? detail = null, string? title = null)
    {
        return Results.Problem(
            title: title ?? "Not Found",
            detail: detail ?? "The requested resource was not found",
            type: "https://tools.ietf.org/html/rfc7231#section-6.5.4",
            statusCode: StatusCodes.Status404NotFound);
    }
}

