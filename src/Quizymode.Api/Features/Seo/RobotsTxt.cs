using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features;

namespace Quizymode.Api.Features.Seo;

public static class RobotsTxt
{
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("robots.txt", Handler)
                .WithTags("SEO")
                .WithSummary("Get robots.txt file")
                .AllowAnonymous()
                .WithOpenApi()
                .Produces<string>(StatusCodes.Status200OK, "text/plain");
        }

        private static IResult Handler()
        {
            const string robotsTxtContent = @"User-agent: *
Allow: /";

            return Results.Content(robotsTxtContent, "text/plain");
        }
    }

    public sealed class FeatureRegistration : IFeatureRegistration
    {
        public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
        {
            // No specific services needed for this feature.
        }
    }
}

