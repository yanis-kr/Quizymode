using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class DefaultCollectionFactoryTests
{
    [Fact]
    public void BuildMetadata_WithDisplayName_UsesFirstThreeCharactersForCollectionName()
    {
        (string name, string? description) = DefaultCollectionFactory.BuildMetadata("Abcdefgh");

        name.Should().Be("Abc's Collection");
        description.Should().Be("Abcdefgh default collection");
    }

    [Fact]
    public void BuildMetadata_WithShortDisplayName_UsesAvailableCharacters()
    {
        (string name, string? description) = DefaultCollectionFactory.BuildMetadata("Al");

        name.Should().Be("Al's Collection");
        description.Should().Be("Al default collection");
    }

    [Fact]
    public void BuildMetadata_WithoutDisplayName_FallsBackToDefaultCollection()
    {
        (string name, string? description) = DefaultCollectionFactory.BuildMetadata("   ");

        name.Should().Be("Default Collection");
        description.Should().BeNull();
    }
}
