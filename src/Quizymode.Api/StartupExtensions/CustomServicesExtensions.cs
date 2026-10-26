using Microsoft.Extensions.DependencyInjection.Extensions;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Services.Taxonomy.Suggestions;
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
        builder.Services.Configure<GitHubSeedSyncOptions>(builder.Configuration.GetSection(GitHubSeedSyncOptions.SectionName));
        builder.Services.Configure<IdeaAbuseProtectionOptions>(builder.Configuration.GetSection(IdeaAbuseProtectionOptions.SectionName));
        builder.Services.Configure<TurnstileOptions>(builder.Configuration.GetSection(TurnstileOptions.SectionName));
        builder.Services.Configure<AuditLogsOptions>(builder.Configuration.GetSection(AuditLogsOptions.SectionName));
        builder.Services.AddSingleton<ITaxonomyRegistry, TaxonomyRegistry>();
        // Global search (#319): in-memory topic index plus lazily refreshed public item counts.
        builder.Services.AddSingleton<ITaxonomySearchIndex, TaxonomySearchIndex>();
        builder.Services.AddSingleton<TaxonomySearchCounts>();
        // Topic suggestion (#322): in-memory model, lazily loaded public item profiles, invalidated by seed sync.
        builder.Services.Configure<TopicSuggestionOptions>(builder.Configuration.GetSection(TopicSuggestionOptions.SectionName));
        builder.Services.TryAddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<TopicTextAnalyzer>();
        builder.Services.AddSingleton<TopicSuggestionProfiles>();
        builder.Services.AddSingleton<ITopicSuggestionInvalidator>(provider => provider.GetRequiredService<TopicSuggestionProfiles>());
        builder.Services.AddSingleton<TopicSuggester>();
        // SimHashService is stateless, so it can be a singleton
        builder.Services.AddSingleton<ISimHashService, SimHashService>();
        builder.Services.AddHttpClient<IGitHubSeedSource, GitHubSeedSource>();
        builder.Services.AddHttpClient("ipgeolocation");
        builder.Services.AddHttpClient<ITurnstileVerificationService, TurnstileVerificationService>();
        builder.Services.AddSingleton<IIpGeolocationService, IpGeolocationService>();
        builder.Services.AddSingleton<ITextModerationService, IdeaTextModerationService>();
        // Stateless classification logic, safe to share across requests.
        builder.Services.AddSingleton<IAttributionClassifier, AttributionClassifier>();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<IUserContext, UserContext>();
        builder.Services.AddScoped<IAuditService, AuditService>();
        builder.Services.AddScoped<ICategoryResolver, CategoryResolver>();
        builder.Services.AddScoped<ITaxonomyItemCategoryResolver, TaxonomyItemCategoryResolver>();
        builder.Services.AddHostedService<StudyGuideCleanupService>();
        builder.Services.AddHostedService<ClientErrorCleanupService>();
        builder.Services.AddHostedService<AnalyticsSessionBackfill>();
        builder.Services.AddHostedService<PageViewRetentionService>();
        builder.Services.AddMemoryCache();
        return builder;
    }
}
