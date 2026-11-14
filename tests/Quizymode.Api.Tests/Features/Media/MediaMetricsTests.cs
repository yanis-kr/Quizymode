using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quizymode.Api.Features.Media;
using Quizymode.Api.Features.Media.Storage;
using Quizymode.Api.Tests.TestFixtures;
using SkiaSharp;
using Xunit;

namespace Quizymode.Api.Tests.Features.Media;

/// <summary>AC 3.28.10: media metrics use small fixed label sets, and media logs never carry URLs, keys or picture data.</summary>
public sealed class MediaMetricsTests : DatabaseTestFixture
{
    private sealed record Measurement(string Instrument, long Value, Dictionary<string, string?> Tags);

    /// <summary>Captures only the media slice's own log lines (framework request logs legitimately contain URLs).</summary>
    private sealed class CapturingLogger : ILoggerProvider
    {
        public List<string> Lines { get; } = [];
        public ILogger CreateLogger(string categoryName) =>
            categoryName.StartsWith("Quizymode.Api.Features.Media", StringComparison.Ordinal) ? new Sink(this) : NullLogger.Instance;
        public void Dispose() { }

        private sealed class Sink(CapturingLogger owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                lock (owner.Lines) { owner.Lines.Add(formatter(state, exception)); }
            }
        }
    }

    private async Task<JwtHttpTestHost> StartAsync(FakeMediaObjectStore store, MediaOptions options, CapturingLogger? logs = null) =>
        await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddSingleton(Options.Create(options));
                services.AddSingleton<IMediaObjectStore>(store);
                services.AddSingleton(new ImageNormalizer(options, NullLogger<ImageNormalizer>.Instance, null));
                services.AddSingleton(TimeProvider.System);
                if (logs is not null) services.AddLogging(builder => builder.AddProvider(logs));
            },
            app =>
            {
                new UploadImage.Endpoint().MapEndpoint(app);
                new GetImageContent.Endpoint().MapEndpoint(app);
            });

    private static HttpRequestMessage Upload(string token, byte[] file, string fileName = "photo.png", string mime = "image/png")
    {
        MultipartFormDataContent form = new();
        ByteArrayContent part = new(file);
        part.Headers.ContentType = new MediaTypeHeaderValue(mime);
        form.Add(part, "file", fileName);
        return JwtHttpTestHost.Request(HttpMethod.Post, "/media/images", token, form);
    }

    private static MeterListener Listen(List<Measurement> sink)
    {
        MeterListener listener = new()
        {
            InstrumentPublished = (instrument, l) =>
            {
                if (instrument.Meter.Name == "Quizymode.Media") l.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            Dictionary<string, string?> map = [];
            foreach (KeyValuePair<string, object?> tag in tags) map[tag.Key] = tag.Value?.ToString();
            lock (sink) { sink.Add(new Measurement(instrument.Name, value, map)); }
        });
        listener.Start();
        return listener;
    }

    [Fact]
    public async Task UploadsAndDeliveries_AreCountedWithBoundedLabelsAndNoIds()
    {
        List<Measurement> seen = [];
        using MeterListener listener = Listen(seen);
        FakeMediaObjectStore store = new();
        await using JwtHttpTestHost host = await StartAsync(store, new MediaOptions());
        string owner = host.CreateToken("owner", "owner@example.com");

        using HttpResponseMessage created = await host.Client.SendAsync(Upload(owner, MediaTestImages.FlagPng()));
        Guid id = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        using HttpResponseMessage refused = await host.Client.SendAsync(Upload(owner, System.Text.Encoding.Latin1.GetBytes("not a picture"), "x.png"));
        using HttpResponseMessage content = await host.Client.SendAsync(JwtHttpTestHost.Request(HttpMethod.Get, $"/media/images/{id}/content", owner));
        long expectedBytes = (await content.Content.ReadAsByteArrayAsync()).Length;

        created.StatusCode.Should().Be(HttpStatusCode.Created);
        refused.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        Measurement[] snapshot;
        lock (seen) { snapshot = [.. seen]; }
        snapshot.Should().Contain(m => m.Instrument == "quizymode.media.uploads" && m.Tags["outcome"] == "ready");
        snapshot.Should().Contain(m => m.Instrument == "quizymode.media.uploads" && m.Tags["outcome"] == "Media.UnsupportedFormat");
        snapshot.Should().Contain(m => m.Instrument == "quizymode.media.deliveries" && m.Tags["mode"] == "proxy" && m.Tags["outcome"] == "ok");
        snapshot.Should().Contain(m => m.Instrument == "quizymode.media.delivered_bytes" && m.Value == expectedBytes);

        string[] allowedKeys = ["outcome", "mode", "decision", "category"];
        foreach (Measurement m in snapshot)
        {
            m.Tags.Keys.Should().OnlyContain(key => allowedKeys.Contains(key));
            m.Tags.Values.Should().OnlyContain(value => value != null && value.Length < 40 && value.Count(c => c == (char)45) < 4 && !value.Contains('/'));
        }
    }

    [Fact]
    public async Task DurableUploadSwitchOffReturns503Disabled()
    {
        await using (Quizymode.Api.Data.ApplicationDbContext db = CreateDbContext())
        {
            db.MediaControls.Add(new Quizymode.Api.Shared.Models.MediaControl { UploadsEnabled = false });
            await db.SaveChangesAsync();
        }

        await using JwtHttpTestHost host = await StartAsync(new FakeMediaObjectStore(), new MediaOptions());
        using HttpResponseMessage response = await host.Client.SendAsync(Upload(host.CreateToken("owner", "owner@example.com"), MediaTestImages.FlagPng()));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await response.Content.ReadAsStringAsync()).Should().Contain("Media.Disabled");
    }

    [Fact]
    public async Task MediaLogsNeverContainSignedUrlsOrPictureData()
    {
        CapturingLogger logs = new();
        FakeMediaObjectStore store = new();
        await using JwtHttpTestHost host = await StartAsync(store, new MediaOptions(), logs);
        string owner = host.CreateToken("owner", "owner@example.com");

        using HttpResponseMessage created = await host.Client.SendAsync(Upload(owner, MediaTestImages.Png(16, 16, SKColors.Red)));
        using HttpResponseMessage refused = await host.Client.SendAsync(Upload(owner, System.Text.Encoding.Latin1.GetBytes("not a picture"), "x.png"));
        Guid id = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        using HttpResponseMessage content = await host.Client.SendAsync(JwtHttpTestHost.Request(HttpMethod.Get, $"/media/images/{id}/content", owner));
        string objectKey = store.Objects.Keys.Single();
        string pictureBase64 = Convert.ToBase64String(store.Objects.Values.Single().AsSpan(0, 24));

        string[] lines;
        lock (logs.Lines) { lines = [.. logs.Lines]; }
        lines.Should().NotBeEmpty();
        foreach (string line in lines)
        {
            line.Should().NotContain("Signature").And.NotContain("Key-Pair-Id").And.NotContain("Expires=").And.NotContain("http://").And.NotContain("https://")
                .And.NotContain(objectKey).And.NotContain(pictureBase64).And.NotContain("Bearer ");
        }
    }
}
