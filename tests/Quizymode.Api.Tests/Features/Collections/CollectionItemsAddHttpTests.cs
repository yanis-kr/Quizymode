using System.Net;
using System.Text;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>#281: POST /collections/{id}/items must run AddRequestValidator before the lookup and ownership checks.</summary>
public sealed class CollectionItemsAddHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string OwnerSubject = "add-owner";
    private const string OtherSubject = "add-other";

    private JwtHttpTestHost _host = null!;
    private Guid _collectionId;
    private Guid _itemId;

    public async Task InitializeAsync()
    {
        Guid ownerId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = ownerId, Subject = OwnerSubject, Email = "owner@example.com", Name = OwnerSubject });
        DbContext.Users.Add(new User { Id = Guid.NewGuid(), Subject = OtherSubject, Email = "other@example.com", Name = OtherSubject });
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = "Owned",
            CreatedBy = ownerId.ToString(),
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Collections.Add(collection);
        Category category = new()
        {
            Id = Guid.NewGuid(),
            Name = $"cat-{Guid.NewGuid()}",
            IsPrivate = false,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow
        };
        DbContext.Categories.Add(category);
        Item item = new()
        {
            Id = Guid.NewGuid(),
            Question = "Q?",
            CorrectAnswer = "A",
            FuzzySignature = "abc",
            FuzzyBucket = 1,
            CreatedBy = "test",
            CreatedAt = DateTime.UtcNow,
            CategoryId = category.Id
        };
        DbContext.Items.Add(item);
        await DbContext.SaveChangesAsync();
        _collectionId = collection.Id;
        _itemId = item.Id;

        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddScoped<IValidator<CollectionItems.AddRequest>, CollectionItems.AddRequestValidator>();
                services.AddScoped<IValidator<CollectionItems.BulkAddRequest>, CollectionItems.BulkAddRequestValidator>();
            },
            app => new CollectionItems.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<(HttpStatusCode Status, string Body)> PostAsync(
        string json, string subject = OwnerSubject, bool withToken = true)
    {
        string? token = withToken ? _host.CreateToken(subject, $"{subject}@example.com") : null;
        using StringContent content = new(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, $"/collections/{_collectionId}/items", token, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("{\"itemId\":\"00000000-0000-0000-0000-000000000000\"}")]
    [InlineData("{}")]
    public async Task Post_EmptyOrOmittedItemId_Returns400AndAddsNothing(string json)
    {
        (HttpStatusCode status, string body) = await PostAsync(json);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("ItemId is required.");
        DbContext.CollectionItems.Count().Should().Be(0);
    }

    [Fact]
    public async Task Post_ValidItemId_Returns201AndAddsItem()
    {
        (HttpStatusCode status, _) = await PostAsync($"{{\"itemId\":\"{_itemId}\"}}");

        status.Should().Be(HttpStatusCode.Created);
        DbContext.CollectionItems.Count().Should().Be(1);
    }

    [Fact]
    public async Task Post_MissingItem_Returns404()
    {
        (HttpStatusCode status, _) = await PostAsync($"{{\"itemId\":\"{Guid.NewGuid()}\"}}");

        status.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Post_NoToken_Returns401()
    {
        (HttpStatusCode status, _) = await PostAsync("{}", withToken: false);

        status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Post_NonOwnerWithEmptyItemId_Returns400ValidationError()
    {
        (HttpStatusCode status, string body) = await PostAsync("{}", OtherSubject);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("ItemId is required.");
        DbContext.CollectionItems.Count().Should().Be(0);
    }
}
