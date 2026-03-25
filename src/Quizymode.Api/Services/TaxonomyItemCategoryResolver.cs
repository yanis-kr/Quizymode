using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Services.Taxonomy;

namespace Quizymode.Api.Services;

internal sealed class TaxonomyItemCategoryResolver(
    ApplicationDbContext db,
    ITaxonomyRegistry taxonomyRegistry) : ITaxonomyItemCategoryResolver
{
    public async Task<Result<Category>> ResolveForItemAsync(string categoryName, CancellationToken cancellationToken = default)
    {
        string trimmed = categoryName.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return Result.Failure<Category>(
                Error.Validation("Category.InvalidName", "Category name cannot be empty"));
        }

        if (!taxonomyRegistry.HasCategory(trimmed))
        {
            return Result.Failure<Category>(
                Error.Validation(
                    "Category.UnknownTaxonomy",
                    $"Category '{trimmed}' is not a valid taxonomy category."));
        }

        Category? category = await db.Categories
            .FirstOrDefaultAsync(
                c => !c.IsPrivate && c.Name.ToLower() == trimmed.ToLower(),
                cancellationToken);

        if (category is null)
        {
            return Result.Failure<Category>(
                Error.Validation(
                    "Category.NotProvisioned",
                    $"Category '{trimmed}' is not available yet. It must exist as a public category in the system."));
        }

        return Result.Success(category);
    }
}
