using System.Net;
using System.Text.Json;
using Amazon.SimpleSystemsManagement;
using Amazon.SimpleSystemsManagement.Model;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Moq;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Shared.Configuration;
using Quizymode.Api.Tests.TestFixtures;
using Serilog;
using Serilog.Core;
using Serilog.Events;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

/// <summary>#782: SSM configuration source, SecretString, name-based log redaction and the source report.</summary>
public sealed class ConfigSourcesTests : DatabaseTestFixture
{
    private const string Canary = "CANARY-sk-not-a-real-secret-123";
    private const string Prefix = "/quizymode/prod/";

    private static Parameter P(string name, string value) => new() { Name = Prefix + name, Value = value };

    private static IConfigurationRoot Build(Mock<IAmazonSimpleSystemsManagement> client, Dictionary<string, string?>? env = null)
    {
        SsmSettings settings = new(Prefix, "us-west-2", "id", "secret");
        return new ConfigurationBuilder()
            .AddInMemoryCollection(env ?? [])
            .Add(new SsmConfigurationSource(settings, () => client.Object))
            .Build();
    }

    [Fact]
    public void Disabled_ByDefault_CreatesNoSource()
    {
        IConfigurationRoot config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Config:Ssm:Prefix"] = Prefix }).Build();
        SsmSettings.From(config).Should().BeNull();
    }

    [Fact]
    public void Enabled_MergesPages_AndOverridesEarlierSources()
    {
        Mock<IAmazonSimpleSystemsManagement> client = new();
        client.SetupSequence(c => c.GetParametersByPathAsync(It.IsAny<GetParametersByPathRequest>(), default))
            .ReturnsAsync(new GetParametersByPathResponse { Parameters = [P("Gemini/ApiKey", Canary)], NextToken = "page2" })
            .ReturnsAsync(new GetParametersByPathResponse { Parameters = [P("ConnectionStrings/PostgreSQL", "Host=x")] });

        IConfigurationRoot config = Build(client, new Dictionary<string, string?> { ["Gemini:ApiKey"] = "from-env" });

        config["Gemini:ApiKey"].Should().Be(Canary);
        config["ConnectionStrings:PostgreSQL"].Should().Be("Host=x");
        client.Verify(c => c.GetParametersByPathAsync(It.Is<GetParametersByPathRequest>(r => r.Recursive == true && r.WithDecryption == true && r.Path == Prefix), default), Times.Exactly(2));
    }

    [Fact]
    public void ClientFailure_FailsFast_WithTypeAndPrefixOnly()
    {
        Mock<IAmazonSimpleSystemsManagement> client = new();
        client.Setup(c => c.GetParametersByPathAsync(It.IsAny<GetParametersByPathRequest>(), default))
            .ThrowsAsync(new AmazonSimpleSystemsManagementException($"denied {Canary}"));

        Action act = () => Build(client);

        act.Should().Throw<InvalidOperationException>().Where(e => e.Message.Contains(Prefix) && e.Message.Contains(nameof(AmazonSimpleSystemsManagementException)) && !e.Message.Contains(Canary));
    }

    [Fact]
    public void ZeroParameters_FailsFast()
    {
        Mock<IAmazonSimpleSystemsManagement> client = new();
        client.Setup(c => c.GetParametersByPathAsync(It.IsAny<GetParametersByPathRequest>(), default)).ReturnsAsync(new GetParametersByPathResponse { Parameters = [] });

        Action act = () => Build(client);

        act.Should().Throw<InvalidOperationException>().Where(e => e.Message.Contains(Prefix));
    }

    [Fact]
    public void MissingBootstrapCredentials_FailsFast_AndNeverUsesAwsEnvironment()
    {
        string? previous = Environment.GetEnvironmentVariable("AWS_ACCESS_KEY_ID");
        Environment.SetEnvironmentVariable("AWS_ACCESS_KEY_ID", "AKIAFROMENVIRONMENT");
        try
        {
            SsmSettings settings = new(Prefix, "us-west-2", "", "");
            Action act = () => new ConfigurationBuilder().Add(new SsmConfigurationSource(settings)).Build();
            act.Should().Throw<InvalidOperationException>().Where(e => e.Message.Contains("missing") && !e.Message.Contains("AKIAFROMENVIRONMENT"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("AWS_ACCESS_KEY_ID", previous);
        }
    }

    private sealed class Opts
    {
        public SecretString Token { get; init; } = new(Canary);

        public string PlainApiKey { get; init; } = Canary;

        public string Name { get; init; } = "ok";
    }

    private sealed class Sink : ILogEventSink
    {
        public List<LogEvent> Events { get; } = [];

        public void Emit(LogEvent logEvent) => Events.Add(logEvent);
    }

    [Fact]
    public void SecretString_MasksToStringJsonAndSerilog()
    {
        SecretString secret = new(Canary);
        secret.ToString().Should().Be("***");
        secret.Reveal().Should().Be(Canary);
        JsonSerializer.Serialize(new { new Opts().Token }).Should().NotContain(Canary).And.Contain("***");

        Sink sink = new();
        using Logger log = new LoggerConfiguration().Destructure.With(SecretLogRedactor.Instance).Enrich.With(SecretLogRedactor.Instance).WriteTo.Sink(sink).CreateLogger();
        log.Information("opts {@Options} {ApiKey}", new Opts(), Canary);

        string rendered = string.Join("|", sink.Events.Select(e => e.RenderMessage() + string.Join(",", e.Properties.Select(p => p.Key + "=" + p.Value))));
        rendered.Should().NotContain(Canary).And.Contain("ok");
    }

    [Fact]
    public void SourceReport_ListsSecretLikeKeysWithSource_AndNoValues()
    {
        Mock<IAmazonSimpleSystemsManagement> client = new();
        client.Setup(c => c.GetParametersByPathAsync(It.IsAny<GetParametersByPathRequest>(), default))
            .ReturnsAsync(new GetParametersByPathResponse { Parameters = [P("Gemini/ApiKey", Canary)] });
        IConfigurationRoot config = Build(client, new Dictionary<string, string?> { ["Groq:ApiKey"] = "x", ["Other:Name"] = "y" });

        IReadOnlyList<ConfigKeySource> report = ConfigSourceReport.Build(config);

        report.Should().Contain(new ConfigKeySource("Gemini:ApiKey", "ssm"));
        report.Select(r => r.Key).Should().NotContain("Other:Name");
        System.Text.Json.JsonSerializer.Serialize(report).Should().NotContain(Canary);
        ConfigSourceReport.SsmKeys(config).Should().Contain("Gemini:ApiKey");
    }

    [Fact]
    public async Task Endpoint_RequiresAdmin_AndReturnsNoValues()
    {
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            _ => { },
            app => new GetConfigSources.Endpoint().MapEndpoint(app));

        using HttpResponseMessage anonymous = await host.Client.SendAsync(JwtHttpTestHost.Request(HttpMethod.Get, "/admin/config-sources", null, null));
        using HttpResponseMessage member = await host.Client.SendAsync(JwtHttpTestHost.Request(HttpMethod.Get, "/admin/config-sources", host.CreateToken("m", "m@example.com"), null));
        using HttpResponseMessage admin = await host.Client.SendAsync(JwtHttpTestHost.Request(HttpMethod.Get, "/admin/config-sources", host.CreateToken("a", "a@example.com", ["Admins"]), null));

        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        member.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        admin.StatusCode.Should().Be(HttpStatusCode.OK);
        (await admin.Content.ReadAsStringAsync()).Should().NotContain(Canary);
    }
}
