using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Users;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Users;

/// <summary>A display name is shown to other users, so it cannot hold an email address.</summary>
public sealed class UpdateUserNameHttpTests : DatabaseTestFixture
{
    [Fact]
    public async Task AC_4_5_5_PutName_WithAtSign_Returns400AndChangesNothing()
    {
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services => services.AddScoped<IValidator<UpdateUserName.Request>, UpdateUserName.Validator>(),
            app => new UpdateUserName.Endpoint().MapEndpoint(app));
        string subject = Guid.NewGuid().ToString();
        string token = host.CreateToken(subject, "owner@example.com");

        async Task<HttpResponseMessage> PutAsync(string name)
        {
            using HttpRequestMessage request = JwtHttpTestHost.Request(
                HttpMethod.Put, "/users/me", token, JsonContent.Create(new { name }));
            return await host.Client.SendAsync(request);
        }

        using HttpResponseMessage accepted = await PutAsync("Plain Name");
        using HttpResponseMessage refused = await PutAsync("someone@example.com");

        accepted.StatusCode.Should().Be(HttpStatusCode.OK);
        refused.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await refused.Content.ReadAsStringAsync()).Should().Contain("Name cannot contain @");
        await using ApplicationDbContext db = CreateDbContext();
        db.Users.Single(user => user.Subject == subject).Name.Should().Be("Plain Name");
    }
}
