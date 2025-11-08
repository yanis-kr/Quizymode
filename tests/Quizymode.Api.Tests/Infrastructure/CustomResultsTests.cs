using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Quizymode.Api.Infrastructure;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Infrastructure;

public sealed class CustomResultsTests
{
    [Fact]
    public void Problem_WithFailureResult_ReturnsProblemResult()
    {
        // Arrange
        Error error = Error.Problem("Test.Code", "Test message");
        Result result = Result.Failure(error);

        // Act
        IResult httpResult = CustomResults.Problem(result);

        // Assert
        httpResult.Should().NotBeNull();
    }

    [Fact]
    public void Problem_WithNotFoundError_ReturnsNotFoundStatusCode()
    {
        // Arrange
        Error error = Error.NotFound("Test.Code", "Not found");
        Result result = Result.Failure(error);

        // Act
        IResult httpResult = CustomResults.Problem(result);

        // Assert
        httpResult.Should().NotBeNull();
    }

    [Fact]
    public void Problem_WithValidationError_ReturnsBadRequestStatusCode()
    {
        // Arrange
        Error error = Error.Validation("Test.Code", "Validation failed");
        Result result = Result.Failure(error);

        // Act
        IResult httpResult = CustomResults.Problem(result);

        // Assert
        httpResult.Should().NotBeNull();
    }

    [Fact]
    public void Problem_WithSuccessResult_ThrowsException()
    {
        // Arrange
        Result result = Result.Success();

        // Act & Assert
        result.Invoking(r => CustomResults.Problem(r))
            .Should().Throw<InvalidOperationException>();
    }
}

