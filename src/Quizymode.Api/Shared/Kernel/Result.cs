// Based on Milan Jovanović's Clean Architecture template
// Source: https://www.milanjovanovic.tech/pragmatic-clean-architecture

using System.Diagnostics.CodeAnalysis;

namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Represents the result of an operation that can either succeed or fail.
/// </summary>
/// <remarks>
/// <para>
/// The <see cref="Result"/> pattern provides a functional approach to error handling,
/// avoiding exceptions for control flow and making error handling explicit in method signatures.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use for business logic operations that can fail (validation, business rules)</item>
/// <item>Use instead of throwing exceptions for expected failures</item>
/// <item>Use when you need to return both success and error information</item>
/// <item>Use to make error handling explicit in method signatures</item>
/// </list>
/// <para>
/// <strong>Benefits:</strong>
/// </para>
/// <list type="bullet">
/// <item>Explicit error handling (errors are part of the return type)</item>
/// <item>No exception overhead for expected failures</item>
/// <item>Composable (can chain operations with Match/Map)</item>
/// <item>Type-safe (compiler enforces error handling)</item>
/// </list>
/// <para>
/// <strong>Example usage:</strong>
/// </para>
/// <code>
/// Result result = await handler.HandleAsync(request);
/// if (result.IsFailure)
/// {
///     return Results.BadRequest(result.Error);
/// }
/// return Results.Ok();
/// </code>
/// </remarks>
public class Result
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Result"/> class.
    /// </summary>
    /// <param name="isSuccess">Whether the operation succeeded.</param>
    /// <param name="error">The error if the operation failed, or <see cref="Error.None"/> if successful.</param>
    /// <exception cref="ArgumentException">Thrown when success state and error don't match (e.g., success with error or failure without error).</exception>
    public Result(bool isSuccess, Error error)
    {
        if (isSuccess && error != Error.None ||
            !isSuccess && error == Error.None)
        {
            throw new ArgumentException("Invalid error", nameof(error));
        }

        IsSuccess = isSuccess;
        Error = error;
    }

    /// <summary>
    /// Gets a value indicating whether the operation succeeded.
    /// </summary>
    public bool IsSuccess { get; }

    /// <summary>
    /// Gets a value indicating whether the operation failed.
    /// </summary>
    public bool IsFailure => !IsSuccess;

    /// <summary>
    /// Gets the error that occurred if the operation failed, or <see cref="Error.None"/> if successful.
    /// </summary>
    public Error Error { get; }

    /// <summary>
    /// Creates a successful result with no value.
    /// </summary>
    /// <returns>A successful <see cref="Result"/>.</returns>
    public static Result Success() => new(true, Error.None);

    /// <summary>
    /// Creates a successful result with a value.
    /// </summary>
    /// <typeparam name="TValue">The type of the value.</typeparam>
    /// <param name="value">The value to return.</param>
    /// <returns>A successful <see cref="Result{TValue}"/> containing the value.</returns>
    public static Result<TValue> Success<TValue>(TValue value) =>
        new(value, true, Error.None);

    /// <summary>
    /// Creates a failed result with an error.
    /// </summary>
    /// <param name="error">The error that occurred.</param>
    /// <returns>A failed <see cref="Result"/> with the specified error.</returns>
    public static Result Failure(Error error) => new(false, error);

    /// <summary>
    /// Creates a failed result with an error and no value.
    /// </summary>
    /// <typeparam name="TValue">The type of the value that would have been returned.</typeparam>
    /// <param name="error">The error that occurred.</param>
    /// <returns>A failed <see cref="Result{TValue}"/> with the specified error.</returns>
    public static Result<TValue> Failure<TValue>(Error error) =>
        new(default, false, error);
}

/// <summary>
/// Represents the result of an operation that returns a value, which can either succeed or fail.
/// </summary>
/// <typeparam name="TValue">The type of the value returned on success.</typeparam>
/// <remarks>
/// <para>
/// <see cref="Result{TValue}"/> extends <see cref="Result"/> to include a value that is only
/// accessible when the operation succeeds. Accessing <see cref="Value"/> when <see cref="Result.IsFailure"/>
/// is true will throw an <see cref="InvalidOperationException"/>.
/// </para>
/// <para>
/// <strong>Example usage:</strong>
/// </para>
/// <code>
/// Result&lt;Item&gt; result = await GetItemAsync(id);
/// if (result.IsSuccess)
/// {
///     Item item = result.Value; // Safe to access
///     return Results.Ok(item);
/// }
/// return Results.NotFound(result.Error);
/// </code>
/// </remarks>
public class Result<TValue> : Result
{
    private readonly TValue? _value;

    /// <summary>
    /// Initializes a new instance of the <see cref="Result{TValue}"/> class.
    /// </summary>
    /// <param name="value">The value if the operation succeeded, or default if failed.</param>
    /// <param name="isSuccess">Whether the operation succeeded.</param>
    /// <param name="error">The error if the operation failed, or <see cref="Error.None"/> if successful.</param>
    public Result(TValue? value, bool isSuccess, Error error)
        : base(isSuccess, error)
    {
        _value = value;
    }

    /// <summary>
    /// Gets the value returned by the operation.
    /// </summary>
    /// <exception cref="InvalidOperationException">Thrown when accessing the value of a failed result.</exception>
    /// <remarks>
    /// Always check <see cref="Result.IsSuccess"/> before accessing this property.
    /// Consider using <see cref="ResultExtensions.Match{TIn, TOut}(Result{TIn}, Func{TIn, TOut}, Func{Result{TIn}, TOut})"/>
    /// for safer access.
    /// </remarks>
    [NotNull]
    public TValue Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException("The value of a failure result can't be accessed.");

    /// <summary>
    /// Implicitly converts a value to a successful result.
    /// </summary>
    /// <param name="value">The value to convert.</param>
    /// <returns>A successful <see cref="Result{TValue}"/> containing the value, or a failure if the value is null.</returns>
    public static implicit operator Result<TValue>(TValue? value) =>
        value is not null ? Success(value) : Failure<TValue>(Error.NullValue);

    /// <summary>
    /// Creates a validation failure result.
    /// </summary>
    /// <param name="error">The validation error that occurred.</param>
    /// <returns>A failed <see cref="Result{TValue}"/> with the specified validation error.</returns>
    /// <remarks>
    /// This is a convenience method for creating failed results from validation errors.
    /// It's functionally equivalent to <see cref="Result.Failure{TValue}(Error)"/>.
    /// </remarks>
    public static Result<TValue> ValidationFailure(Error error) =>
        new(default, false, error);
}

