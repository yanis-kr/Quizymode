using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    /// <summary>
    /// Adds custom services to the application's dependency injection container.
    /// </summary>
    /// <remarks>This method registers the <see cref="ISimHashService"/> as a singleton service in the
    /// dependency injection container.</remarks>
    /// <param name="builder">The <see cref="WebApplicationBuilder"/> to configure.</param>
    /// <returns>The <see cref="WebApplicationBuilder"/> instance, to allow for method chaining.</returns>
    public static WebApplicationBuilder AddCustomServices(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<SeedOptions>(builder.Configuration.GetSection(SeedOptions.SectionName));
        builder.Services.Configure<CategoryOptions>(builder.Configuration.GetSection(CategoryOptions.SectionName));
        builder.Services.Configure<TaxonomyOptions>(builder.Configuration.GetSection(TaxonomyOptions.SectionName));
        builder.Services.AddSingleton<ITaxonomyRegistry, TaxonomyRegistry>();
        // SimHashService is stateless, so it can be a singleton
        builder.Services.AddSingleton<ISimHashService, SimHashService>();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<IUserContext, UserContext>();
        builder.Services.AddScoped<IAuditService, AuditService>();
        builder.Services.AddScoped<ICategoryResolver, CategoryResolver>();
        builder.Services.AddScoped<ITaxonomyItemCategoryResolver, TaxonomyItemCategoryResolver>();
        builder.Services.AddScoped<IStudyGuideChunkingService, StudyGuideChunkingService>();
        builder.Services.AddScoped<IStudyGuidePromptBuilderService, StudyGuidePromptBuilderService>();
        builder.Services.AddHostedService<StudyGuideCleanupService>();
        builder.Services.AddMemoryCache();
        return builder;
    }
}
