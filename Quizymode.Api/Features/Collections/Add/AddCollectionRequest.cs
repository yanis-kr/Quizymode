namespace Quizymode.Api.Features.Collections.Add;

public record AddCollectionRequest(
    string Name,
    string Description,
    string CategoryId,
    string SubcategoryId,
    string Visibility = "global");
