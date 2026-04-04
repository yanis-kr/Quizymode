using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class CategoryResolverTests : DatabaseTestFixture
{
    private CategoryResolver CreateResolver() =>
        new CategoryResolver(DbContext, NullLogger<CategoryResolver>.Instance);

    [Fact]
    public async Task ResolveOrCreateAsync_EmptyName_ReturnsValidationError()
    {
        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("  ", false, "user-1", false);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Category.InvalidName");
    }

    [Fact]
    public async Task ResolveOrCreateAsync_GlobalCategoryNonAdmin_ReturnsAdminOnlyError()
    {
        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("Science", isPrivate: false, "user-1", isAdmin: false);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Category.AdminOnly");
    }

    [Fact]
    public async Task ResolveOrCreateAsync_GlobalCategoryAdmin_ExistingGlobal_ReturnsExisting()
    {
        Category existing = new() { Id = Guid.NewGuid(), Name = "Science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(existing);
        await DbContext.SaveChangesAsync();

        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("Science", isPrivate: false, "admin", isAdmin: true);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(existing.Id);
    }

    [Fact]
    public async Task ResolveOrCreateAsync_GlobalCategoryAdmin_ExistingPrivateWithSameName_ReturnsConflict()
    {
        Category existing = new() { Id = Guid.NewGuid(), Name = "private-cat", IsPrivate = true, CreatedBy = "user-1", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(existing);
        await DbContext.SaveChangesAsync();

        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("private-cat", isPrivate: false, "admin", isAdmin: true);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Category.NameExists");
    }

    [Fact]
    public async Task ResolveOrCreateAsync_GlobalCategoryAdmin_NewName_CreatesGlobal()
    {
        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("NewCategory", isPrivate: false, "admin", isAdmin: true);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("NewCategory");
        result.Value.IsPrivate.Should().BeFalse();
        DbContext.Categories.Should().ContainSingle(c => c.Name == "NewCategory" && !c.IsPrivate);
    }

    [Fact]
    public async Task ResolveOrCreateAsync_PrivateCategory_ExistingGlobal_ReturnsGlobal()
    {
        Category globalCat = new() { Id = Guid.NewGuid(), Name = "Science", IsPrivate = false, CreatedBy = "admin", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(globalCat);
        await DbContext.SaveChangesAsync();

        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("Science", isPrivate: true, "user-1", isAdmin: false);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(globalCat.Id);
        result.Value.IsPrivate.Should().BeFalse();
    }

    [Fact]
    public async Task ResolveOrCreateAsync_PrivateCategory_OtherUsersPrivate_ReturnsConflict()
    {
        Category otherPrivate = new() { Id = Guid.NewGuid(), Name = "my-cat", IsPrivate = true, CreatedBy = "other-user", CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(otherPrivate);
        await DbContext.SaveChangesAsync();

        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("my-cat", isPrivate: true, "current-user", isAdmin: false);

        result.IsFailure.Should().BeTrue();
        result.Error!.Code.Should().Be("Category.NameExists");
    }

    [Fact]
    public async Task ResolveOrCreateAsync_PrivateCategory_OwnPrivate_ReturnsExisting()
    {
        string userId = "user-1";
        Category ownPrivate = new() { Id = Guid.NewGuid(), Name = "my-cat", IsPrivate = true, CreatedBy = userId, CreatedAt = DateTime.UtcNow };
        DbContext.Categories.Add(ownPrivate);
        await DbContext.SaveChangesAsync();

        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("my-cat", isPrivate: true, userId, isAdmin: false);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Id.Should().Be(ownPrivate.Id);
    }

    [Fact]
    public async Task ResolveOrCreateAsync_PrivateCategory_NewName_CreatesPrivate()
    {
        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("user-topic", isPrivate: true, "user-1", isAdmin: false);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("user-topic");
        result.Value.IsPrivate.Should().BeTrue();
        result.Value.CreatedBy.Should().Be("user-1");
        DbContext.Categories.Should().ContainSingle(c => c.Name == "user-topic" && c.IsPrivate);
    }

    [Fact]
    public async Task ResolveOrCreateAsync_TrimsName()
    {
        var resolver = CreateResolver();

        var result = await resolver.ResolveOrCreateAsync("  ScienceX  ", isPrivate: true, "user-1", isAdmin: false);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Name.Should().Be("ScienceX");
    }
}
