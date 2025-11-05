// Based on Milan Jovanović's Clean Architecture template
// Source: https://www.milanjovanovic.tech/pragmatic-clean-architecture

namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Represents an error that occurred during an operation.
/// </summary>
/// <remarks>
/// <para>
/// The <see cref="Error"/> record provides a structured way to represent errors with a code,
/// description, and type. It's used with the <see cref="Result"/> pattern to provide explicit
/// error handling without exceptions.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use with <see cref="Result"/> to represent operation failures</item>
/// <item>Use for business logic errors (validation, business rules)</item>
/// <item>Use for expected failures (not exceptions)</item>
/// <item>Use to provide consistent error information across the application</item>
/// </list>
/// <para>
/// <strong>Error codes:</strong>
/// </para>
/// <para>
/// Error codes should follow a consistent format: "Category.Operation" (e.g., "Items.GetFailed",
/// "Items.CreateFailed", "Users.NotFound"). This makes it easy to identify and handle errors
/// programmatically.
/// </para>
/// </remarks>
public record Error
{
    /// <summary>
    /// Represents the absence of an error (used for successful operations).
    /// </summary>
    public static readonly Error None = new(string.Empty, string.Empty, ErrorType.Failure);

    /// <summary>
    /// Represents a null value error (used when a null value is provided where it's not expected).
    /// </summary>
    public static readonly Error NullValue = new(
        "General.Null",
        "Null value was provided",
        ErrorType.Failure);

    /// <summary>
    /// Initializes a new instance of the <see cref="Error"/> record.
    /// </summary>
    /// <param name="code">A unique error code identifying the error (e.g., "Items.GetFailed").</param>
    /// <param name="description">A human-readable description of the error.</param>
    /// <param name="type">The type/category of the error.</param>
    public Error(string code, string description, ErrorType type)
    {
        Code = code;
        Description = description;
        Type = type;
    }

    /// <summary>
    /// Gets the unique error code identifying this error.
    /// </summary>
    /// <remarks>
    /// Error codes should follow the format "Category.Operation" (e.g., "Items.GetFailed").
    /// This allows programmatic error handling and consistent error identification.
    /// </remarks>
    public string Code { get; }

    /// <summary>
    /// Gets a human-readable description of the error.
    /// </summary>
    /// <remarks>
    /// This description should be suitable for displaying to end users or logging.
    /// </remarks>
    public string Description { get; }

    /// <summary>
    /// Gets the type/category of the error.
    /// </summary>
    /// <remarks>
    /// The error type helps categorize errors (Failure, Validation, NotFound, etc.) and can be
    /// used to determine appropriate HTTP status codes or error handling strategies.
    /// </remarks>
    public ErrorType Type { get; }

    /// <summary>
    /// Creates a generic failure error.
    /// </summary>
    /// <param name="code">The error code.</param>
    /// <param name="description">The error description.</param>
    /// <returns>A new <see cref="Error"/> with type <see cref="ErrorType.Failure"/>.</returns>
    /// <remarks>
    /// Use this for general failures that don't fit into other categories.
    /// </remarks>
    public static Error Failure(string code, string description) =>
        new(code, description, ErrorType.Failure);

    /// <summary>
    /// Creates a "not found" error.
    /// </summary>
    /// <param name="code">The error code.</param>
    /// <param name="description">The error description.</param>
    /// <returns>A new <see cref="Error"/> with type <see cref="ErrorType.NotFound"/>.</returns>
    /// <remarks>
    /// Use this when a requested resource cannot be found (maps to HTTP 404).
    /// </remarks>
    public static Error NotFound(string code, string description) =>
        new(code, description, ErrorType.NotFound);

    /// <summary>
    /// Creates a "problem" error (typically for server errors or unexpected issues).
    /// </summary>
    /// <param name="code">The error code.</param>
    /// <param name="description">The error description.</param>
    /// <returns>A new <see cref="Error"/> with type <see cref="ErrorType.Problem"/>.</returns>
    /// <remarks>
    /// Use this for server-side errors or unexpected problems (maps to HTTP 500).
    /// </remarks>
    public static Error Problem(string code, string description) =>
        new(code, description, ErrorType.Problem);

    /// <summary>
    /// Creates a "conflict" error (typically for duplicate resources or conflicting state).
    /// </summary>
    /// <param name="code">The error code.</param>
    /// <param name="description">The error description.</param>
    /// <returns>A new <see cref="Error"/> with type <see cref="ErrorType.Conflict"/>.</returns>
    /// <remarks>
    /// Use this when a resource conflict occurs (maps to HTTP 409).
    /// </remarks>
    public static Error Conflict(string code, string description) =>
        new(code, description, ErrorType.Conflict);

    /// <summary>
    /// Creates a validation error.
    /// </summary>
    /// <param name="code">The error code.</param>
    /// <param name="description">The error description.</param>
    /// <returns>A new <see cref="Error"/> with type <see cref="ErrorType.Validation"/>.</returns>
    /// <remarks>
    /// Use this for validation failures (maps to HTTP 400).
    /// </remarks>
    public static Error Validation(string code, string description) =>
        new(code, description, ErrorType.Validation);
}

