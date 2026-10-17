using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.StudyGuideDocuments;
using Quizymode.Api.Features.StudyGuideUploads;
using Xunit;

namespace Quizymode.Api.Tests.Features.StudyGuideDocuments;

/// <summary>
/// #206: ServiceDefaults adds the standard resilience handler (10 s attempt timeout, 30 s total, retries) to every
/// HttpClient. LLM vendor clients must not inherit it, or real completions are cut off and billable calls retried.
/// </summary>
public sealed class LlmHttpClientPipelineTests
{
    [Theory]
    [InlineData("IOpenAiCompatibleChatClient")]
    [InlineData("IStudyGuideQuestionGenerator")]
    public void LlmClients_HaveNoResilienceHandler(string clientName)
    {
        using ServiceProvider provider = BuildProvider();

        HandlerTypeNames(provider, clientName).Should().NotContain(name => name.Contains("Resilience"));
    }

    [Fact]
    public void OtherClients_KeepTheDefaultResilienceHandler()
    {
        using ServiceProvider provider = BuildProvider();

        HandlerTypeNames(provider, "control").Should().Contain(name => name.Contains("Resilience"));
    }

    private static ServiceProvider BuildProvider()
    {
        IConfiguration configuration = new ConfigurationBuilder().AddInMemoryCollection().Build();
        ServiceCollection services = new();
        services.AddLogging();
        services.AddSingleton(configuration);

        // Same default as Quizymode.Api.ServiceDefaults.
        services.ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler());

        new CreateStudyGuideDocument.FeatureRegistration().AddToServiceCollection(services, configuration);
        new CreateStudyGuideUpload.FeatureRegistration().AddToServiceCollection(services, configuration);
        services.AddHttpClient("control");

        return services.BuildServiceProvider();
    }

    private static List<string> HandlerTypeNames(IServiceProvider provider, string clientName)
    {
        IHttpMessageHandlerFactory factory = provider.GetRequiredService<IHttpMessageHandlerFactory>();
        List<string> names = [];
        HttpMessageHandler? handler = factory.CreateHandler(clientName);
        while (handler is not null)
        {
            names.Add(handler.GetType().FullName ?? handler.GetType().Name);
            handler = (handler as DelegatingHandler)?.InnerHandler;
        }

        return names;
    }
}
