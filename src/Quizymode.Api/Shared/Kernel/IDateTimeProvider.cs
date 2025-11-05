// Based on Milan Jovanović's Clean Architecture template
// Source: https://www.milanjovanovic.tech/pragmatic-clean-architecture

namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Provides access to the current date and time.
/// </summary>
/// <remarks>
/// <para>
/// The <see cref="IDateTimeProvider"/> interface abstracts access to the system clock,
/// making it easier to test code that depends on the current time and allowing for
/// time manipulation in tests.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use instead of <see cref="DateTime.UtcNow"/> directly in domain logic</item>
/// <item>Use when you need to test time-dependent behavior</item>
/// <item>Use when you need to control time in tests (mock/fake time)</item>
/// <item>Use to ensure consistent time access across the application</item>
/// </list>
/// <para>
/// <strong>Benefits:</strong>
/// </para>
/// <list type="bullet">
/// <item>Testable (can mock time in tests)</item>
/// <item>Consistent (all code uses same time source)</item>
/// <item>Flexible (can implement time zones, business days, etc.)</item>
/// </list>
/// <para>
/// <strong>Implementation:</strong>
/// </para>
/// <para>
/// The default implementation should return <see cref="DateTime.UtcNow"/>. For tests,
/// you can create a mock or fake implementation that returns a fixed time.
/// </para>
/// <para>
/// <strong>Example usage:</strong>
/// </para>
/// <code>
/// public class ItemHandler
/// {
///     private readonly IDateTimeProvider _dateTimeProvider;
///     
///     public ItemHandler(IDateTimeProvider dateTimeProvider)
///     {
///         _dateTimeProvider = dateTimeProvider;
///     }
///     
///     public Item CreateItem(string question)
///     {
///         return new Item
///         {
///             Question = question,
///             CreatedAt = _dateTimeProvider.UtcNow // Instead of DateTime.UtcNow
///         };
///     }
/// }
/// </code>
/// </remarks>
public interface IDateTimeProvider
{
    /// <summary>
    /// Gets the current date and time in UTC.
    /// </summary>
    /// <remarks>
    /// This should return the current UTC time, equivalent to <see cref="DateTime.UtcNow"/>.
    /// In tests, this can be mocked to return a fixed time.
    /// </remarks>
    DateTime UtcNow { get; }
}

