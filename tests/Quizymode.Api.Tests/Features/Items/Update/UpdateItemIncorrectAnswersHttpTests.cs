using System.Net;
using System.Text;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items.Update;

/// <summary>#276: updating an item (including a legacy one with duplicate distractors) with conflicting incorrect answers is a 400.</summary>
public sealed class UpdateItemIncorrectAnswersHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private JwtHttpTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddScoped<IValidator<UpdateItem.Request>, UpdateItem.Validator>();
                services.AddSingleton(new Mock<ISimHashService>().Object);
                services.AddSingleton(new Mock<ITaxonomyItemCategoryResolver>().Object);
                services.AddSingleton(new Mock<ITaxonomyRegistry>().Object);
            },
            app => new UpdateItem.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Theory]
    [InlineData("[\"x\",\"X\"]", "Incorrect answers must be different from each other.")]
    [InlineData("[\"a\"]", "Incorrect answers must be different from the correct answer.")]
    public async Task PutItem_ConflictingIncorrectAnswers_Returns400WithMessage(string incorrect, string expectedMessage)
    {
        string json = "{\"category\":\"geography\",\"navigationKeyword1\":\"capitals\",\"navigationKeyword2\":\"europe\",\"question\":\"Q?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":" + incorrect + ",\"explanation\":\"\",\"isPrivate\":false}";
        string token = _host.CreateToken("update-user", "update@example.com");
        using StringContent content = new(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Put, "/items/" + Guid.NewGuid(), token, content);

        using HttpResponseMessage response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).Should().Contain(expectedMessage);
    }
}
