using System.Net;
using System.Text;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.AddBulk;

/// <summary>#272: omitted or null keywords/items must yield 400, not a 500 from a NullReferenceException in the validator.</summary>
public sealed class AddItemsBulkHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string ItemsJson = "\"items\":[{\"question\":\"Q?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\"],\"explanation\":\"\"}]";
    private const string Head = "\"isPrivate\":true,\"category\":\"geography\",\"keyword1\":\"capitals\",\"keyword2\":\"europe\"";

    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddScoped<IValidator<AddItemsBulk.Request>, AddItemsBulk.Validator>();
                services.AddSingleton(new Mock<ISimHashService>().Object);
                services.AddSingleton(new Mock<ITaxonomyItemCategoryResolver>().Object);
                services.AddSingleton(new Mock<ITaxonomyRegistry>().Object);
            },
            app => new AddItemsBulk.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<(HttpStatusCode Status, string Body)> PostAsync(string json)
    {
        string token = _host.CreateToken("bulk-user", "bulk@example.com");
        using StringContent content = new(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Post, "/items/bulk", token, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("{" + Head + "," + ItemsJson + "}", "Keywords list is required")]
    [InlineData("{" + Head + ",\"keywords\":null," + ItemsJson + "}", "Keywords list is required")]
    [InlineData("{" + Head + ",\"keywords\":[]}", "Items is required")]
    public async Task PostBulk_OmittedOrNullKeywordsOrItems_Returns400AndCreatesNothing(string json, string expectedMessage)
    {
        (HttpStatusCode status, string body) = await PostAsync(json);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain(expectedMessage);
        DbContext.Items.Count().Should().Be(0);
    }
}
