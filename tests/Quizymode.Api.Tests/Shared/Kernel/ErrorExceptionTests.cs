using FluentAssertions;
using Quizymode.Api.Shared.Kernel;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Kernel;

public sealed class ErrorExceptionTests
{
    private const string Secret = "secret-internal-detail-281";

    [Fact]
    public void Problem_WithException_StoresExceptionAndKeepsCodeAndType()
    {
        InvalidOperationException ex = new(Secret);

        Error error = Error.Problem("Test.Failed", "Failed to do it.", ex);

        error.Code.Should().Be("Test.Failed");
        error.Description.Should().Be("Failed to do it.");
        error.Type.Should().Be(ErrorType.Problem);
        error.Exception.Should().BeSameAs(ex);
    }

    [Fact]
    public void ToString_WithException_DoesNotIncludeExceptionDetails()
    {
        Error error = Error.Problem("Test.Failed", "Failed to do it.", new InvalidOperationException(Secret));

        string text = error.ToString();

        text.Should().NotContain(Secret);
        text.Should().NotContain("InvalidOperationException");
        text.Should().Contain("Test.Failed");
    }
}
