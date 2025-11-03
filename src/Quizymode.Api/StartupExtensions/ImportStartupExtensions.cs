using Quizymode.Api.Features.Import;

namespace Quizymode.Api.StartupExtensions;

internal static class ImportStartupExtensions
{
	public static WebApplicationBuilder AddImportFeature(this WebApplicationBuilder builder)
	{
		builder.Services.AddScoped<ImportFromJsonHandler>();
		return builder;
	}

	public static WebApplication MapImportEndpoints(this WebApplication app)
	{
		app.MapImportFromJsonEndpoint();
		return app;
	}
}


