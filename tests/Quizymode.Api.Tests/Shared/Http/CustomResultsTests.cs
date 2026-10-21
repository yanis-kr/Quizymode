using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Quizymode.Api.Tests.TestFixtures;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Http;

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

    private const string Secret = "secret-internal-detail-281";

    [Fact]
    public void Problem_WithExceptionAndLogger_LogsOnceAtErrorWithException()
    {
        InvalidOperationException ex = new(Secret);
        CapturingLoggerProvider provider = new();
        ILogger logger = provider.CreateLogger("test");

        CustomResults.Problem(Result.Failure(Error.Problem("Test.Failed", "Failed to do it.", ex)), logger);

        provider.Entries.Should().ContainSingle();
        provider.Entries[0].Level.Should().Be(LogLevel.Error);
        provider.Entries[0].Exception.Should().BeSameAs(ex);
    }

    private static async Task<(HttpContext Context, string Body, CapturingLoggerProvider Provider)> ExecuteAsync(Error error)
    {
        CapturingLoggerProvider provider = new();
        ServiceCollection services = new();
        services.AddLogging(b => b.AddProvider(provider));
        ServiceProvider sp = services.BuildServiceProvider();
        DefaultHttpContext context = new() { RequestServices = sp };
        MemoryStream body = new();
        context.Response.Body = body;

        IResult result = CustomResults.Problem(Result.Failure(error));
        await result.ExecuteAsync(context);
        return (context, System.Text.Encoding.UTF8.GetString(body.ToArray()), provider);
    }

    [Fact]
    public async Task Problem_WithExceptionAndNoLogger_LogsAtExecuteAndBodyIsGeneric()
    {
        (HttpContext context, string text, CapturingLoggerProvider provider) =
            await ExecuteAsync(Error.Problem("Test.Failed", "Failed to do it.", new InvalidOperationException(Secret)));

        context.Response.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
        text.Should().Contain("Failed to do it.");
        text.Should().NotContain(Secret);
        var errors = provider.Entries.Where(e => e.Level >= LogLevel.Warning).ToList();
        errors.Should().ContainSingle();
        errors[0].Level.Should().Be(LogLevel.Error);
        errors[0].Exception!.Message.Should().Be(Secret);
    }

    [Fact]
    public async Task Forbidden_DefaultsTo403ProblemDetailsWithGenericDetail()
    {
        DefaultHttpContext context = new() { RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider() };
        MemoryStream body = new();
        context.Response.Body = body;

        await CustomResults.Forbidden().ExecuteAsync(context);

        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        string text = System.Text.Encoding.UTF8.GetString(body.ToArray());
        text.Should().Contain("\"title\":\"Forbidden\"");
        text.Should().Contain("https://tools.ietf.org/html/rfc7231#section-6.5.3");
        text.Should().Contain("You do not have permission to perform this action.");
    }

    [Fact]
    public async Task Problem_WithoutException_LogsNothingAndBodyUnchanged()
    {
        (HttpContext context, string text, CapturingLoggerProvider provider) =
            await ExecuteAsync(Error.Problem("Test.Failed", "Plain failure."));

        context.Response.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
        text.Should().Contain("Plain failure.");
        provider.Entries.Where(e => e.Level >= LogLevel.Warning).Should().BeEmpty();
    }
}
