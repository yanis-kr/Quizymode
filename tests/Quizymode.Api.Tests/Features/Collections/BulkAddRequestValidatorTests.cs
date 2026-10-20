using FluentAssertions;
using FluentValidation.Results;
using Quizymode.Api.Features.Collections;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

public sealed class BulkAddRequestValidatorTests
{
    private static List<string> Errors(List<Guid>? ids)
    {
        ValidationResult result = new CollectionItems.BulkAddRequestValidator().Validate(new CollectionItems.BulkAddRequest(ids!));
        return result.Errors.Select(e => e.ErrorMessage).ToList();
    }

    [Fact]
    public void Validate_NullItemIds_ReturnsExactlyRequiredMessage() =>
        Errors(null).Should().Equal("ItemIds is required.");

    [Fact]
    public void Validate_EmptyItemIds_ReturnsExactlyAtLeastOneMessage() =>
        Errors([]).Should().Equal("At least one ItemId is required.");

    [Fact]
    public void Validate_EmptyGuid_ReturnsGuidMessage() =>
        Errors([Guid.Empty]).Should().Equal("All ItemIds must be valid GUIDs.");

    [Fact]
    public void Validate_ValidIds_IsValid() =>
        Errors([Guid.NewGuid()]).Should().BeEmpty();
}
