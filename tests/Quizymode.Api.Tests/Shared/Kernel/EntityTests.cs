using FluentAssertions;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Kernel;

public sealed class EntityTests
{
    private sealed class TestDomainEvent : IDomainEvent { }
    private sealed class AnotherDomainEvent : IDomainEvent { }

    private sealed class TestEntity : Entity
    {
        public void RaiseEvent(IDomainEvent domainEvent) => Raise(domainEvent);
    }

    [Fact]
    public void DomainEvents_InitiallyEmpty()
    {
        var entity = new TestEntity();
        entity.DomainEvents.Should().BeEmpty();
    }

    [Fact]
    public void Raise_AddsEventToDomainEvents()
    {
        var entity = new TestEntity();
        var evt = new TestDomainEvent();

        entity.RaiseEvent(evt);

        entity.DomainEvents.Should().ContainSingle().Which.Should().Be(evt);
    }

    [Fact]
    public void Raise_MultipleEvents_AccumulatesAll()
    {
        var entity = new TestEntity();

        entity.RaiseEvent(new TestDomainEvent());
        entity.RaiseEvent(new AnotherDomainEvent());
        entity.RaiseEvent(new TestDomainEvent());

        entity.DomainEvents.Should().HaveCount(3);
    }

    [Fact]
    public void ClearDomainEvents_EmptiesTheList()
    {
        var entity = new TestEntity();
        entity.RaiseEvent(new TestDomainEvent());
        entity.RaiseEvent(new AnotherDomainEvent());

        entity.ClearDomainEvents();

        entity.DomainEvents.Should().BeEmpty();
    }

    [Fact]
    public void DomainEvents_ReturnsDefensiveCopy()
    {
        var entity = new TestEntity();
        entity.RaiseEvent(new TestDomainEvent());

        List<IDomainEvent> snapshot = entity.DomainEvents;
        entity.ClearDomainEvents();

        // The snapshot should still have the event
        snapshot.Should().ContainSingle();
        // The entity should now be empty
        entity.DomainEvents.Should().BeEmpty();
    }
}
