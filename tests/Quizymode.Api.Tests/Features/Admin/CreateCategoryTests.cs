using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class CreateCategoryTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_UniqueName_CreatesCategory()
    {
        var request = new CreateCategory.CreateCategoryRequest("Science", "All about science");

        var result = await CreateCategory.HandleAsync(request, DbContext, "admin-user", CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("Science");
        result.Value.Description.Should().Be("All about science");
        DbContext.Categories.Should().ContainSingle(c => c.Name == "Science" && !c.IsPrivate);
    }

    [Fact]
    public async Task HandleAsync_DuplicateName_ReturnsConflict()
    {
        DbContext.Categories.Add(new Category { Id = Guid.NewGuid(), Name = "Science", IsPrivate = false, CreatedBy = "admin" });
        await DbContext.SaveChangesAsync();

        var request = new CreateCategory.CreateCategoryRequest("Science");

        var result = await CreateCategory.HandleAsync(request, DbContext, "admin-user", CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryNameExists");
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public async Task HandleAsync_DuplicateNameCaseInsensitive_ReturnsConflict()
    {
        DbContext.Categories.Add(new Category { Id = Guid.NewGuid(), Name = "science", IsPrivate = false, CreatedBy = "admin" });
        await DbContext.SaveChangesAsync();

        var request = new CreateCategory.CreateCategoryRequest("SCIENCE");

        var result = await CreateCategory.HandleAsync(request, DbContext, "admin-user", CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryNameExists");
    }

    [Fact]
    public async Task HandleAsync_TrimsName()
    {
        var request = new CreateCategory.CreateCategoryRequest("  History  ");

        var result = await CreateCategory.HandleAsync(request, DbContext, "admin-user", CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("History");
    }

    [Fact]
    public async Task HandleAsync_NullDescription_StoredAsNull()
    {
        var request = new CreateCategory.CreateCategoryRequest("Math");

        var result = await CreateCategory.HandleAsync(request, DbContext, "admin-user", CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Description.Should().BeNull();
        result.Value.ShortDescription.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_WithShortDescription_Stores()
    {
        var request = new CreateCategory.CreateCategoryRequest("Art", ShortDescription: "Art topics");

        var result = await CreateCategory.HandleAsync(request, DbContext, "admin-user", CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.ShortDescription.Should().Be("Art topics");
    }
}

public sealed class CreateCategoryValidatorTests
{
    private readonly CreateCategory.Validator _validator = new();

    [Fact]
    public async Task Validate_ValidRequest_Passes()
    {
        var result = await _validator.ValidateAsync(new CreateCategory.CreateCategoryRequest("Science"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_EmptyName_Fails()
    {
        var result = await _validator.ValidateAsync(new CreateCategory.CreateCategoryRequest(""));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Name");
    }

    [Fact]
    public async Task Validate_NameTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new CreateCategory.CreateCategoryRequest(new string('a', 101)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_DescriptionTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new CreateCategory.CreateCategoryRequest("Name", new string('d', 501)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_ShortDescriptionTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new CreateCategory.CreateCategoryRequest("Name", ShortDescription: new string('s', 121)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_NullDescriptionAndShortDescription_Passes()
    {
        var result = await _validator.ValidateAsync(new CreateCategory.CreateCategoryRequest("Name", null, null));
        result.IsValid.Should().BeTrue();
    }
}
