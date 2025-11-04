using FluentAssertions;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Kernel;

public sealed class ErrorTests
{
    [Fact]
    public void Failure_CreatesError()
    {
        // Act
        Error error = Error.Failure("Test.Code", "Test message");

        // Assert
        error.Code.Should().Be("Test.Code");
        error.Description.Should().Be("Test message");
        error.Type.Should().Be(ErrorType.Failure);
    }

    [Fact]
    public void NotFound_CreatesNotFoundError()
    {
        // Act
        Error error = Error.NotFound("Test.Code", "Not found message");

        // Assert
        error.Code.Should().Be("Test.Code");
        error.Description.Should().Be("Not found message");
        error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public void Problem_CreatesProblemError()
    {
        // Act
        Error error = Error.Problem("Test.Code", "Problem message");

        // Assert
        error.Code.Should().Be("Test.Code");
        error.Description.Should().Be("Problem message");
        error.Type.Should().Be(ErrorType.Problem);
    }

    [Fact]
    public void Conflict_CreatesConflictError()
    {
        // Act
        Error error = Error.Conflict("Test.Code", "Conflict message");

        // Assert
        error.Code.Should().Be("Test.Code");
        error.Description.Should().Be("Conflict message");
        error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public void Validation_CreatesValidationError()
    {
        // Act
        Error error = Error.Validation("Test.Code", "Validation message");

        // Assert
        error.Code.Should().Be("Test.Code");
        error.Description.Should().Be("Validation message");
        error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public void None_IsDefault()
    {
        // Assert
        Error.None.Code.Should().BeEmpty();
        Error.None.Description.Should().BeEmpty();
        Error.None.Type.Should().Be(ErrorType.Failure);
    }
}

