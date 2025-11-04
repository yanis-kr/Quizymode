using FluentAssertions;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Kernel;

public sealed class ResultTests
{
    [Fact]
    public void Success_ReturnsSuccessResult()
    {
        // Act
        Result result = Result.Success();

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.IsFailure.Should().BeFalse();
        result.Error.Should().Be(Error.None);
    }

    [Fact]
    public void Failure_ReturnsFailureResult()
    {
        // Arrange
        Error error = Error.Problem("Test.Code", "Test message");

        // Act
        Result result = Result.Failure(error);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(error);
    }

    [Fact]
    public void Success_WithValue_ReturnsSuccessResult()
    {
        // Act
        Result<string> result = Result.Success("test value");

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be("test value");
    }

    [Fact]
    public void Failure_WithValue_ReturnsFailureResult()
    {
        // Arrange
        Error error = Error.NotFound("Test.Code", "Not found");

        // Act
        Result<string> result = Result.Failure<string>(error);

        // Assert
        result.IsSuccess.Should().BeFalse();
        result.Invoking(r => _ = r.Value).Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void ImplicitConversion_FromValue_ReturnsSuccess()
    {
        // Act
        Result<string> result = "test value";

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be("test value");
    }

    [Fact]
    public void ImplicitConversion_FromNull_ReturnsFailure()
    {
        // Act
        Result<string> result = (string?)null;

        // Assert
        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(Error.NullValue);
    }
}

