namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Represents the type or category of an error.
/// </summary>
/// <remarks>
/// <para>
/// Error types help categorize errors and can be used to determine appropriate HTTP status codes,
/// error handling strategies, or user-facing messages.
/// </para>
/// <para>
/// <strong>HTTP Status Code Mapping:</strong>
/// </para>
/// <list type="table">
/// <item>
/// <term><see cref="Validation"/></term>
/// <description>HTTP 400 Bad Request</description>
/// </item>
/// <item>
/// <term><see cref="NotFound"/></term>
/// <description>HTTP 404 Not Found</description>
/// </item>
/// <item>
/// <term><see cref="Conflict"/></term>
/// <description>HTTP 409 Conflict</description>
/// </item>
/// <item>
/// <term><see cref="Problem"/></term>
/// <description>HTTP 500 Internal Server Error</description>
/// </item>
/// <item>
/// <term><see cref="Failure"/></term>
/// <description>HTTP 400 Bad Request (general failure)</description>
/// </item>
/// </list>
/// </remarks>
public enum ErrorType
{
    /// <summary>
    /// A general failure (maps to HTTP 400).
    /// </summary>
    Failure = 0,

    /// <summary>
    /// A validation error (maps to HTTP 400).
    /// </summary>
    /// <remarks>
    /// Use for input validation failures, business rule violations, or invalid data.
    /// </remarks>
    Validation = 1,

    /// <summary>
    /// A server problem or unexpected error (maps to HTTP 500).
    /// </summary>
    /// <remarks>
    /// Use for unexpected errors, exceptions, or server-side issues that shouldn't have occurred.
    /// </remarks>
    Problem = 2,

    /// <summary>
    /// A resource not found error (maps to HTTP 404).
    /// </summary>
    /// <remarks>
    /// Use when a requested resource doesn't exist or cannot be found.
    /// </remarks>
    NotFound = 3,

    /// <summary>
    /// A conflict error (maps to HTTP 409).
    /// </summary>
    /// <remarks>
    /// Use when there's a conflict with the current state (e.g., duplicate resource, optimistic concurrency conflict).
    /// </remarks>
    Conflict = 4
}

