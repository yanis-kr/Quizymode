using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Services.Taxonomy.Suggestions;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>#322: the production service registration wires topic suggestion without a database at startup.</summary>
public sealed class TopicSuggestionRegistrationTests
{
    [Fact]
    public void AddCustomServices_ResolvesTopicSuggestion_AndSeedSyncInvalidatesTheSameProfiles()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = AppContext.BaseDirectory });
        builder.AddCustomServices();
        using ServiceProvider provider = builder.Services.BuildServiceProvider();

        TopicSuggestionProfiles profiles = provider.GetRequiredService<TopicSuggestionProfiles>();
        ITopicSuggestionInvalidator invalidator = provider.GetRequiredService<ITopicSuggestionInvalidator>();

        invalidator.Should().BeSameAs(profiles);
        provider.GetRequiredService<TopicSuggester>().Should().NotBeNull();
        profiles.LoadsStarted.Should().Be(0, "nothing loads at startup");
        profiles.Model.ProfileItemCount.Should().Be(0);
        profiles.Model.L2Count.Should().BeGreaterThan(1000, "the taxonomy part is built from the YAML registry");
    }

    [Fact]
    public void NoOpInvalidator_DoesNothing()
    {
        new NoOpTopicSuggestionInvalidator().Invalidate();
    }
}
