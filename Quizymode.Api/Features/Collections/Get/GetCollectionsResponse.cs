using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Collections.Responses;

public record GetCollectionsResponse(List<CollectionModel> Collections);
