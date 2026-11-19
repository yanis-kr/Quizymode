using Quizymode.Api.Shared.Configuration;
using Quizymode.Api.Shared.Kernel;

namespace Quizymode.Api.Features.Admin;

public static class GetConfigSources
{
    public sealed record SourceItem(string Key, string Source);

    public sealed record Response(IReadOnlyList<SourceItem> Keys);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("admin/config-sources", Handler)
                .WithTags("Admin")
                .WithSummary("Where each secret-looking configuration key comes from (Admin only)")
                .WithDescription("Lists key names and their source (ssm, environment or appsettings). Values are never returned.")
                .RequireAuthorization("Admin")
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static IResult Handler(IConfiguration configuration)
        {
            IReadOnlyList<SourceItem> keys = configuration is IConfigurationRoot root
                ? ConfigSourceReport.Build(root).Select(k => new SourceItem(k.Key, k.Source)).ToList()
                : [];
            return Results.Ok(new Response(keys));
        }
    }
}
