// Based on Milan Jovanović's Clean Architecture template
// Source: https://www.milanjovanovic.tech/pragmatic-clean-architecture

namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Base class for domain entities that support domain events.
/// </summary>
/// <remarks>
/// <para>
/// The <see cref="Entity"/> base class provides infrastructure for domain-driven design (DDD) patterns,
/// specifically the Domain Events pattern. It allows entities to raise domain events that can be
/// dispatched after persistence operations complete.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use when your domain entities need to publish domain events (e.g., ItemCreated, ItemUpdated)</item>
/// <item>Use when you need to decouple domain logic from infrastructure concerns</item>
/// <item>Use when implementing event-driven architecture patterns</item>
/// <item>Use when you need to notify other parts of the system about domain state changes</item>
/// </list>
/// <para>
/// <strong>When NOT to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Don't use for simple data models (DTOs, view models, or simple entities without domain events)</item>
/// <item>Don't use if you don't need domain events (adds unnecessary complexity)</item>
/// <item>Don't use for anemic domain models (entities with only data, no behavior)</item>
/// </list>
/// <para>
/// <strong>Example usage:</strong>
/// </para>
/// <code>
/// public sealed class Item : Entity
/// {
///     public Guid Id { get; set; }
///     public string Question { get; set; }
///     
///     public void UpdateQuestion(string newQuestion)
///     {
///         Question = newQuestion;
///         Raise(new ItemUpdatedDomainEvent(Id, newQuestion));
///     }
/// }
/// </code>
/// </remarks>
public abstract class Entity
{
    private readonly List<IDomainEvent> _domainEvents = [];

    /// <summary>
    /// Gets the list of domain events raised by this entity.
    /// </summary>
    /// <remarks>
    /// Domain events are collected during entity operations and dispatched after
    /// <see cref="Microsoft.EntityFrameworkCore.DbContext.SaveChangesAsync(System.Threading.CancellationToken)"/> completes.
    /// The list is cleared after dispatching to prevent duplicate event processing.
    /// </remarks>
    public List<IDomainEvent> DomainEvents => [.. _domainEvents];

    /// <summary>
    /// Clears all domain events from this entity.
    /// </summary>
    /// <remarks>
    /// Typically called by the infrastructure layer (DbContext) after events have been
    /// dispatched to prevent duplicate processing. You should not call this manually
    /// in business logic.
    /// </remarks>
    public void ClearDomainEvents()
    {
        _domainEvents.Clear();
    }

    /// <summary>
    /// Raises a domain event that will be dispatched after the entity is persisted.
    /// </summary>
    /// <param name="domainEvent">The domain event to raise.</param>
    /// <remarks>
    /// <para>
    /// Domain events are collected and dispatched after <see cref="Microsoft.EntityFrameworkCore.DbContext.SaveChangesAsync(System.Threading.CancellationToken)"/>
    /// completes successfully. This ensures events are only published for persisted changes.
    /// </para>
    /// <para>
    /// <strong>Best practices:</strong>
    /// </para>
    /// <list type="bullet">
    /// <item>Raise events in domain methods (e.g., UpdateQuestion, MarkAsCompleted)</item>
    /// <item>Raise events immediately after state changes</item>
    /// <item>Keep events immutable (use records)</item>
    /// <item>Include only necessary data in events (not entire entity)</item>
    /// </list>
    /// <para>
    /// <strong>Example:</strong>
    /// </para>
    /// <code>
    /// public void CompleteItem()
    /// {
    ///     IsCompleted = true;
    ///     CompletedAt = DateTime.UtcNow;
    ///     Raise(new ItemCompletedDomainEvent(Id, CompletedAt.Value));
    /// }
    /// </code>
    /// </remarks>
    public void Raise(IDomainEvent domainEvent)
    {
        _domainEvents.Add(domainEvent);
    }
}

