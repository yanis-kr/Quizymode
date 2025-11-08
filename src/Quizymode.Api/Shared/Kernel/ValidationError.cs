namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Represents a validation error for a specific property.
/// </summary>
/// <param name="PropertyName">The name of the property that failed validation.</param>
/// <param name="ErrorMessage">A human-readable error message describing the validation failure.</param>
/// <param name="ErrorCode">A unique error code identifying the validation error.</param>
/// <remarks>
/// <para>
/// <see cref="ValidationError"/> is used to represent field-level validation errors,
/// typically returned from FluentValidation or other validation frameworks.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use for property-level validation errors (e.g., "Email is required", "Age must be between 0 and 120")</item>
/// <item>Use when returning validation errors from FluentValidation validators</item>
/// <item>Use when you need to map validation errors to specific form fields in the UI</item>
/// </list>
/// <para>
/// <strong>Difference from <see cref="Error"/>:</strong>
/// </para>
/// <para>
/// <see cref="Error"/> represents general operation errors, while <see cref="ValidationError"/>
/// represents specific property-level validation failures. Use <see cref="ValidationError"/> when
/// you need to tie errors to specific properties/fields.
/// </para>
/// <para>
/// <strong>Example:</strong>
/// </para>
/// <code>
/// var errors = new List&lt;ValidationError&gt;
/// {
///     new("Email", "Email is required", "Email.Required"),
///     new("Age", "Age must be between 0 and 120", "Age.Range")
/// };
/// </code>
/// </remarks>
public record ValidationError(string PropertyName, string ErrorMessage, string ErrorCode);

