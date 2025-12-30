using System.Linq;
using System.Text;
using System.Xml.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features;

namespace Quizymode.Api.Features.Seo;

public static class SitemapXml
{
    private sealed record SitemapEntry(string Location, string LastMod, string ChangeFreq, string Priority);

    private static readonly SitemapEntry[] SitemapEntries = new[]
    {
        new SitemapEntry("https://www.quizymode.com/", "2025-01-29", "weekly", "1.0"),
        new SitemapEntry("https://www.quizymode.com/categories", "2025-01-29", "weekly", "0.8"),
        new SitemapEntry("https://www.quizymode.com/collections", "2025-01-29", "weekly", "0.8")
    };

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("sitemap.xml", Handler)
                .WithTags("SEO")
                .WithSummary("Get sitemap.xml file")
                .AllowAnonymous()
                .WithOpenApi()
                .Produces<string>(StatusCodes.Status200OK, "application/xml");
        }

        private static IResult Handler()
        {
            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            XDocument sitemap = new(
                new XElement(ns + "urlset",
                    SitemapEntries.Select(entry => new XElement(ns + "url",
                        new XElement(ns + "loc", entry.Location),
                        new XElement(ns + "lastmod", entry.LastMod),
                        new XElement(ns + "changefreq", entry.ChangeFreq),
                        new XElement(ns + "priority", entry.Priority)
                    ))
                )
            );

            string xmlContent = sitemap.ToString();
            return Results.Content(xmlContent, "application/xml", Encoding.UTF8);
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

