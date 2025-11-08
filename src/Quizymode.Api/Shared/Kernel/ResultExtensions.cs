namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Provides extension methods for working with <see cref="Result"/> and <see cref="Result{TValue}"/>.
/// </summary>
/// <remarks>
/// <para>
/// These extension methods provide functional programming patterns for working with results,
/// allowing you to handle success and failure cases in a functional style.
/// </para>
/// </remarks>
public static class ResultExtensions
{
    /// <summary>
    /// Matches the result to one of two functions based on success or failure.
    /// </summary>
    /// <typeparam name="TOut">The return type of both functions.</typeparam>
    /// <param name="result">The result to match.</param>
    /// <param name="onSuccess">The function to execute if the result is successful.</param>
    /// <param name="onFailure">The function to execute if the result failed.</param>
    /// <returns>The result of executing the appropriate function.</returns>
    /// <remarks>
    /// <para>
    /// This method provides a functional way to handle results, similar to pattern matching
    /// in functional languages. It ensures both success and failure cases are handled.
    /// </para>
    /// <para>
    /// <strong>Example:</strong>
    /// </para>
    /// <code>
    /// string message = result.Match(
    ///     onSuccess: () => "Operation succeeded",
    ///     onFailure: r => $"Operation failed: {r.Error.Description}"
    /// );
    /// </code>
    /// </remarks>
    public static TOut Match<TOut>(
        this Result result,
        Func<TOut> onSuccess,
        Func<Result, TOut> onFailure)
    {
        return result.IsSuccess ? onSuccess() : onFailure(result);
    }

    /// <summary>
    /// Matches the result to one of two functions based on success or failure, providing access to the value on success.
    /// </summary>
    /// <typeparam name="TIn">The type of the value in the result.</typeparam>
    /// <typeparam name="TOut">The return type of both functions.</typeparam>
    /// <param name="result">The result to match.</param>
    /// <param name="onSuccess">The function to execute if the result is successful, receiving the value.</param>
    /// <param name="onFailure">The function to execute if the result failed.</param>
    /// <returns>The result of executing the appropriate function.</returns>
    /// <remarks>
    /// <para>
    /// This method provides a functional way to handle results with values. The success function
    /// receives the value, making it safe to access without checking <see cref="Result.IsSuccess"/>.
    /// </para>
    /// <para>
    /// <strong>Example:</strong>
    /// </para>
    /// <code>
    /// IResult httpResult = result.Match(
    ///     onSuccess: item => Results.Ok(item),
    ///     onFailure: r => Results.NotFound(r.Error)
    /// );
    /// </code>
    /// </remarks>
    public static TOut Match<TIn, TOut>(
        this Result<TIn> result,
        Func<TIn, TOut> onSuccess,
        Func<Result<TIn>, TOut> onFailure)
    {
        return result.IsSuccess ? onSuccess(result.Value) : onFailure(result);
    }
}

