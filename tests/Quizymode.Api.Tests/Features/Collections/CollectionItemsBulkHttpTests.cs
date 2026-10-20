using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Quizymode.Api.Features.Collections;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Collections;

/// <summary>#273: omitted, null or empty itemIds must yield a 400 validation error, not a leaked exception message.</summary>
public sealed class CollectionItemsBulkHttpTests : DatabaseTestFixture, IAsyncLifetime
{
    private const string Subject = "bulk-owner";

    private JwtHttpTestHost _host = null!;
    private Guid _collectionId;
    private Guid _itemId;

    public async Task InitializeAsync()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = userId, Subject = Subject, Email = "owner@example.com", Name = Subject });
        Collection collection = new()
        {
            Id = Guid.NewGuid(),
            Name = "Owned",
            CreatedBy = userId.ToString(),
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
            services => services.AddScoped<IValidator<CollectionItems.BulkAddRequest>, CollectionItems.BulkAddRequestValidator>(),
            app => new CollectionItems.Endpoint().MapEndpoint(app));
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private async Task<(HttpStatusCode Status, string Body)> PostAsync(string json, bool withToken = true)
    {
        string? token = withToken ? _host.CreateToken(Subject, "owner@example.com") : null;
        using StringContent content = new(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(
            HttpMethod.Post, $"/collections/{_collectionId}/items/bulk", token, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("{\"itemIds\":null}", "ItemIds is required.")]
    [InlineData("{}", "ItemIds is required.")]
    [InlineData("{\"itemIds\":[]}", "At least one ItemId is required.")]
    [InlineData("{\"itemIds\":[\"00000000-0000-0000-0000-000000000000\"]}", "All ItemIds must be valid GUIDs.")]
    public async Task PostBulk_MissingNullEmptyOrInvalidItemIds_Returns400AndAddsNothing(string json, string expectedMessage)
    {
        (HttpStatusCode status, string body) = await PostAsync(json);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain(expectedMessage);
        body.Should().NotContain("Object reference");
        body.Should().NotContain("Failed to add items");
        body.Should().NotContain("Exception");
        DbContext.CollectionItems.Count().Should().Be(0);
    }

    [Fact]
    public async Task PostBulk_ValidItemId_Returns200AndAddsItem()
    {
        (HttpStatusCode status, string body) = await PostAsync($"{{\"itemIds\":[\"{_itemId}\"]}}");

        status.Should().Be(HttpStatusCode.OK);
        using JsonDocument doc = JsonDocument.Parse(body);
        doc.RootElement.GetProperty("addedCount").GetInt32().Should().Be(1);
        DbContext.CollectionItems.Count().Should().Be(1);
    }

    [Fact]
    public async Task PostBulk_NoToken_Returns401()
    {
        (HttpStatusCode status, _) = await PostAsync("{\"itemIds\":null}", withToken: false);

        status.Should().Be(HttpStatusCode.Unauthorized);
    }
}
