using FluentAssertions;
using FluentValidation.Results;
using Quizymode.Api.Features.Collections;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class AddRequestValidatorTests
{
    private static List<string> Errors(Guid itemId)
    {
        ValidationResult result = new CollectionItems.AddRequestValidator().Validate(new CollectionItems.AddRequest(itemId));
        return result.Errors.Select(e => e.ErrorMessage).ToList();
    }

    [Fact]
    public void Validate_EmptyGuid_ReturnsExactlyItemIdRequired() =>
        Errors(Guid.Empty).Should().Equal("ItemId is required.");

    [Fact]
    public void Validate_ValidGuid_IsValid() =>
        Errors(Guid.NewGuid()).Should().BeEmpty();
}
