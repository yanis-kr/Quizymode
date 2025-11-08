using FluentAssertions;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Kernel;

public sealed class ResultExtensionsTests
{
    [Fact]
    public void Match_OnSuccess_ReturnsSuccessValue()
    {
        // Arrange
        Result result = Result.Success();

        // Act
        string value = result.Match(
            onSuccess: () => "success",
            onFailure: _ => "failure");

        // Assert
        value.Should().Be("success");
    }

    [Fact]
    public void Match_OnFailure_ReturnsFailureValue()
    {
        // Arrange
        Error error = Error.Problem("Test.Code", "Test message");
        Result result = Result.Failure(error);

        // Act
        string value = result.Match(
            onSuccess: () => "success",
            onFailure: _ => "failure");

        // Assert
        value.Should().Be("failure");
    }

    [Fact]
    public void Match_WithValue_OnSuccess_ReturnsSuccessValue()
    {
        // Arrange
        Result<string> result = Result.Success("test value");

        // Act
        string value = result.Match(
            onSuccess: v => $"success: {v}",
            onFailure: _ => "failure");

        // Assert
        value.Should().Be("success: test value");
    }

    [Fact]
    public void Match_WithValue_OnFailure_ReturnsFailureValue()
    {
        // Arrange
        Error error = Error.Problem("Test.Code", "Test message");
        Result<string> result = Result.Failure<string>(error);

        // Act
        string value = result.Match(
            onSuccess: v => $"success: {v}",
            onFailure: _ => "failure");

        // Assert
        value.Should().Be("failure");
    }
}

