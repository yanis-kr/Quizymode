// Based on Milan Jovanović's Clean Architecture template
// Source: https://www.milanjovanovic.tech/pragmatic-clean-architecture

namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Handles a specific type of domain event.
/// </summary>
/// <typeparam name="TDomainEvent">The type of domain event to handle.</typeparam>
/// <remarks>
/// <para>
/// Domain event handlers are responsible for processing domain events after they are dispatched.
/// They typically handle side effects such as sending notifications, updating caches, or triggering
/// other processes.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use to handle side effects of domain events (e.g., send email, update cache)</item>
/// <item>Use to integrate with external systems (e.g., publish to message queue)</item>
/// <item>Use to maintain read models or projections</item>
/// <item>Use to implement audit logging</item>
/// </list>
/// <para>
/// <strong>Best practices:</strong>
/// </para>
/// <list type="bullet">
/// <item>Keep handlers focused on a single responsibility</item>
/// <item>Make handlers idempotent when possible (handle duplicate events gracefully)</item>
/// <item>Don't throw exceptions unless absolutely necessary (they stop event processing)</item>
/// <item>Log all operations for debugging and auditing</item>
/// <item>Use dependency injection for dependencies</item>
/// </list>
/// <para>
/// <strong>Registration:</strong>
/// </para>
/// <para>
/// Handlers are automatically discovered and registered when they implement <see cref="IDomainEventHandler{TDomainEvent}"/>.
/// They are resolved from the service container when events are dispatched.
/// </para>
/// <para>
/// <strong>Example:</strong>
/// </para>
/// <code>
/// internal sealed class ItemCreatedDomainEventHandler : IDomainEventHandler&lt;ItemCreatedDomainEvent&gt;
/// {
///     private readonly IEmailService _emailService;
///     private readonly ILogger&lt;ItemCreatedDomainEventHandler&gt; _logger;
///     
///     public async Task Handle(ItemCreatedDomainEvent domainEvent, CancellationToken cancellationToken)
///     {
///         _logger.LogInformation("Item {ItemId} was created", domainEvent.ItemId);
///         
///         // Send notification, update cache, etc.
///         await _emailService.SendItemCreatedNotificationAsync(domainEvent.ItemId, cancellationToken);
///     }
/// }
/// </code>
/// </remarks>
public interface IDomainEventHandler<in TDomainEvent>
    where TDomainEvent : IDomainEvent
{
    /// <summary>
    /// Handles the domain event.
    /// </summary>
    /// <param name="domainEvent">The domain event to handle.</param>
    /// <param name="cancellationToken">A cancellation token that can be used to cancel the operation.</param>
    /// <returns>A task representing the asynchronous operation.</returns>
    /// <remarks>
    /// This method is called by the domain events dispatcher after the entity is persisted.
    /// If this method throws an exception, event processing may be interrupted.
    /// </remarks>
    Task Handle(TDomainEvent domainEvent, CancellationToken cancellationToken);
}

