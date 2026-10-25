using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.StartupExtensions;
using Serilog;
using Serilog.Core;
using Serilog.Events;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>#324: the text a visitor searched for must not reach any log sink.</summary>
public sealed class SearchQueryLogRedactorTests
{
    private sealed class CapturingSink : ILogEventSink
    {
        private readonly List<string> _messages = [];

        public IReadOnlyList<string> Messages
        {
            get
            {
                lock (_messages)
                {
                    return _messages.ToList();
                }
            }
        }

        public void Emit(LogEvent logEvent)
        {
            lock (_messages)
            {
                _messages.Add(logEvent.RenderMessage());
            }
        }
    }

    [Fact]
    public async Task RealRequestLogs_ForSearch_DoNotContainTheQueryText()
    {
        CapturingSink sink = new();
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Host.UseSerilog((_, configuration) => configuration
            .MinimumLevel.Information()
            .Enrich.With(SearchQueryLogRedactor.Instance)
            .WriteTo.Sink(sink));
        await using WebApplication app = builder.Build();
        app.MapGet("search", () => Results.Ok());
        app.MapGet("other", () => Results.Ok());
        await app.StartAsync();
        string address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        using HttpClient client = new() { BaseAddress = new Uri(address) };

        (await client.GetAsync("/search?q=very-secret-phrase&types=items")).EnsureSuccessStatusCode();
        (await client.GetAsync("/other?q=visible-elsewhere")).EnsureSuccessStatusCode();
        await app.StopAsync();

        IReadOnlyList<string> messages = sink.Messages;
        messages.Should().Contain(message => message.Contains("/search", StringComparison.Ordinal) && message.Contains("Request starting"));
        messages.Should().NotContain(message => message.Contains("very-secret-phrase", StringComparison.Ordinal));
        messages.Should().Contain(message => message.Contains("?[redacted]", StringComparison.Ordinal));
        messages.Should().Contain(message => message.Contains("?q=visible-elsewhere", StringComparison.Ordinal));
    }

    [Fact]
    public void Enrich_LeavesEventsWithoutAQueryStringAlone()
    {
        LogEvent logEvent = new(
            DateTimeOffset.UtcNow,
            LogEventLevel.Information,
            null,
            new Serilog.Parsing.MessageTemplateParser().Parse("Path {Path}"),
            [new LogEventProperty("Path", new ScalarValue("/search"))]);

        SearchQueryLogRedactor.Instance.Enrich(logEvent, new TestPropertyFactory());

        logEvent.Properties.Should().NotContainKey("QueryString");
    }

    private sealed class TestPropertyFactory : ILogEventPropertyFactory
    {
        public LogEventProperty CreateProperty(string name, object? value, bool destructureObjects = false) =>
            new(name, new ScalarValue(value));
    }
}
