using Quizymode.Api.Features;
using Quizymode.Api.Services.Taxonomy;

namespace Quizymode.Api.Features.Taxonomy;

public static class GetTaxonomy
{
    public sealed record L2Dto(string Slug, string? Description);

    public sealed record L1Dto(string Slug, string? Description, IReadOnlyList<L2Dto> Keywords);

    public sealed record CategoryDto(
        string Slug,
        string Description,
        IReadOnlyList<L1Dto> Groups,
        IReadOnlyList<string> AllKeywordSlugs);

    public sealed record Response(IReadOnlyList<CategoryDto> Categories);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("taxonomy", Handler)
                .WithTags("Taxonomy")
                .WithSummary("Get category and keyword taxonomy (from YAML, in-memory)")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static IResult Handler(ITaxonomyRegistry registry)
        {
            List<CategoryDto> categories = [];
            foreach (string slug in registry.CategorySlugs)
            {
                TaxonomyCategoryDefinition? def = registry.GetCategory(slug);
                if (def is null)
                    continue;

                List<L1Dto> groups = [];
                foreach (TaxonomyL1Group l1 in def.L1Groups)
                {
                    List<L2Dto> l2 = l1.L2Leaves.Select(leaf => new L2Dto(leaf.Slug, leaf.Description)).ToList();
                    groups.Add(new L1Dto(l1.Slug, l1.Description, l2));
                }

                categories.Add(new CategoryDto(
                    def.Slug,
                    def.Description,
                    groups,
                    def.AllKeywordSlugs.OrderBy(s => s, StringComparer.Ordinal).ToList()));
            }

            return Results.Ok(new Response(categories));
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
        }
    }
}
