using FluentAssertions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class UpdateCategoryTests : DatabaseTestFixture
{
    private async Task<Category> CreateCategoryAsync(string name = "Science")
    {
        Category cat = new() { Id = Guid.NewGuid(), Name = name, IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(cat);
        await DbContext.SaveChangesAsync();
        return cat;
    }

    [Fact]
    public async Task HandleAsync_CategoryNotFound_ReturnsNotFound()
    {
        var request = new UpdateCategory.UpdateCategoryRequest("New Name");

        var result = await UpdateCategory.HandleAsync(Guid.NewGuid(), request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Type.Should().Be(ErrorType.NotFound);
        result.Error.Code.Should().Be("Admin.CategoryNotFound");
    }

    [Fact]
    public async Task HandleAsync_DuplicateName_ReturnsConflict()
    {
        await CreateCategoryAsync("Math");
        Category cat = await CreateCategoryAsync("Science");

        var request = new UpdateCategory.UpdateCategoryRequest("Math");

        var result = await UpdateCategory.HandleAsync(cat.Id, request, DbContext, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Admin.CategoryNameExists");
        result.Error.Type.Should().Be(ErrorType.Conflict);
    }

    [Fact]
    public async Task HandleAsync_SameNameAsItself_Succeeds()
    {
        Category cat = await CreateCategoryAsync("Science");

        var request = new UpdateCategory.UpdateCategoryRequest("Science");

        var result = await UpdateCategory.HandleAsync(cat.Id, request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("Science");
    }

    [Fact]
    public async Task HandleAsync_UpdatesName()
    {
        Category cat = await CreateCategoryAsync("Old Name");

        var request = new UpdateCategory.UpdateCategoryRequest("New Name");

        var result = await UpdateCategory.HandleAsync(cat.Id, request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("New Name");

        Category? stored = await DbContext.Categories.FindAsync(cat.Id);
        stored!.Name.Should().Be("New Name");
    }

    [Fact]
    public async Task HandleAsync_UpdatesDescription()
    {
        Category cat = await CreateCategoryAsync();

        var request = new UpdateCategory.UpdateCategoryRequest(cat.Name, "Updated description");

        var result = await UpdateCategory.HandleAsync(cat.Id, request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Description.Should().Be("Updated description");
    }

    [Fact]
    public async Task HandleAsync_UpdatesShortDescription()
    {
        Category cat = await CreateCategoryAsync();

        var request = new UpdateCategory.UpdateCategoryRequest(cat.Name, ShortDescription: "Short desc");

        var result = await UpdateCategory.HandleAsync(cat.Id, request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.ShortDescription.Should().Be("Short desc");
    }

    [Fact]
    public async Task HandleAsync_WhitespaceDescription_StoredAsNull()
    {
        Category cat = await CreateCategoryAsync();

        var request = new UpdateCategory.UpdateCategoryRequest(cat.Name, "   ");

        var result = await UpdateCategory.HandleAsync(cat.Id, request, DbContext, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Description.Should().BeNull();
    }
}

public sealed class UpdateCategoryValidatorTests
{
    private readonly UpdateCategory.Validator _validator = new();

    [Fact]
    public async Task Validate_ValidRequest_Passes()
    {
        var result = await _validator.ValidateAsync(new UpdateCategory.UpdateCategoryRequest("Science"));
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_EmptyName_Fails()
    {
        var result = await _validator.ValidateAsync(new UpdateCategory.UpdateCategoryRequest(""));
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Name");
    }

    [Fact]
    public async Task Validate_NameTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new UpdateCategory.UpdateCategoryRequest(new string('n', 101)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_DescriptionTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new UpdateCategory.UpdateCategoryRequest("Name", new string('d', 501)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_ShortDescriptionTooLong_Fails()
    {
        var result = await _validator.ValidateAsync(new UpdateCategory.UpdateCategoryRequest("Name", ShortDescription: new string('s', 121)));
        result.IsValid.Should().BeFalse();
    }
}
