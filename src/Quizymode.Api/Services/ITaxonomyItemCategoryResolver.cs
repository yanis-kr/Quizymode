using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

public interface ITaxonomyItemCategoryResolver
{
    /// <summary>Resolves an existing public category that appears in the taxonomy YAML. Does not create categories.</summary>
    Task<Result<Category>> ResolveForItemAsync(string categoryName, CancellationToken cancellationToken = default);
}
