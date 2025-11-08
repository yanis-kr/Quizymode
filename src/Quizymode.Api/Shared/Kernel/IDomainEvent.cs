// Based on Milan Jovanović's Clean Architecture template
// Source: https://www.milanjovanovic.tech/pragmatic-clean-architecture

namespace Quizymode.Api.Shared.Kernel;

/// <summary>
/// Marker interface for domain events.
/// </summary>
/// <remarks>
/// <para>
/// Domain events represent something that happened in the domain that domain experts care about.
/// They are raised by entities (via <see cref="Entity.Raise(IDomainEvent)"/>) and dispatched
/// after the entity is persisted to notify other parts of the system about state changes.
/// </para>
/// <para>
/// <strong>When to use:</strong>
/// </para>
/// <list type="bullet">
/// <item>Use when you need to notify other bounded contexts or aggregates about changes</item>
/// <item>Use when you need to trigger side effects (e.g., send email, update cache, audit log)</item>
/// <item>Use when you need to decouple domain logic from infrastructure concerns</item>
/// <item>Use when implementing event-driven architecture patterns</item>
/// </list>
/// <para>
/// <strong>Best practices:</strong>
/// </para>
/// <list type="bullet">
/// <item>Make events immutable (use records)</item>
/// <item>Name events in past tense (e.g., ItemCreated, UserRegistered)</item>
/// <item>Include only necessary data (not entire entity)</item>
/// <item>Keep events focused on a single domain concept</item>
/// <item>Raise events in domain methods, not in handlers</item>
/// </list>
/// <para>
/// <strong>Example:</strong>
/// </para>
/// <code>
/// public sealed record ItemCreatedDomainEvent(Guid ItemId, string CategoryId, DateTime CreatedAt) : IDomainEvent;
/// 
/// // In domain entity:
/// public void Create()
/// {
///     // ... creation logic ...
///     Raise(new ItemCreatedDomainEvent(Id, CategoryId, CreatedAt));
/// }
/// </code>
/// </remarks>
public interface IDomainEvent;

