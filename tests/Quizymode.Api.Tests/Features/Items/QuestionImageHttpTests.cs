using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Add;
using Quizymode.Api.Features.Items.AddBulk;
using Quizymode.Api.Features.Items.Export;
using Quizymode.Api.Features.Items.UploadToCollection;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>#407: write paths ignore a questionImage body field (AC 2.1.20); export includes it (AC 2.2.7.10).</summary>
public sealed class QuestionImageHttpTests : ItemTestFixture, IAsyncLifetime
{
    private static readonly string[] AdminGroups = ["Admins"];
    private JwtHttpTestHost _host = null!;
    private Guid _ownerId;

    public async Task InitializeAsync()
    {
        _host = await JwtHttpTestHost.StartAsync(
            CreateDbContext,
            services =>
            {
                services.AddScoped<IValidator<AddItem.Request>, AddItem.Validator>();
                services.AddScoped<IValidator<AddItemsBulk.Request>, AddItemsBulk.Validator>();
                services.AddScoped<IValidator<UploadItemsToCollection.Request>, UploadItemsToCollection.Validator>();
                services.AddSingleton<ISimHashService>(SimHashService);
                services.AddSingleton(TaxonomyRegistry);
                services.AddScoped<ITaxonomyItemCategoryResolver>(sp =>
                    new TaxonomyItemCategoryResolver(sp.GetRequiredService<ApplicationDbContext>(), TaxonomyRegistry));
                Mock<ITextModerationService> moderation = new();
                moderation.Setup(m => m.Evaluate(It.IsAny<string?[]>()))
                    .Returns(new TextModerationResult(TextModerationOutcome.Clean));
                services.AddSingleton(moderation.Object);
            },
            app =>
            {
                new AddItem.Endpoint().MapEndpoint(app);
                new AddItemsBulk.Endpoint().MapEndpoint(app);
                new UploadItemsToCollection.Endpoint().MapEndpoint(app);
                new ExportItems.Endpoint().MapEndpoint(app);
            });

        _ownerId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = _ownerId, Subject = "owner-sub", Email = "owner@example.com", Name = "owner" });
        await DbContext.SaveChangesAsync();
        await EnsureGeographyPublicWithNavAsync(_ownerId.ToString());
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string UserToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string AdminToken => _host.CreateToken("owner-sub", "owner@example.com", AdminGroups);

    private const string ImageJson = ",\"questionImage\":{\"key\":\"curated:flags/fr\",\"altText\":\"Three bands\"}";

    private static string ItemJson => "\"question\":\"Q?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\"],\"explanation\":\"\"" + ImageJson;

    private async Task<(HttpStatusCode Status, string Body)> SendAsync(HttpMethod method, string path, string? json, string token)
    {
        using StringContent? content = json is null ? null : new StringContent(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    public static TheoryData<string> WritePaths => new() { "add", "bulk", "upload" };

    [Theory]
    [MemberData(nameof(WritePaths))]
    public async Task Create_WithQuestionImageBodyField_StoresNoImage(string path)
    {
        (HttpStatusCode status, string body) = path switch
        {
            "add" => await SendAsync(HttpMethod.Post, "/items",
                "{\"category\":\"geography\",\"navigationKeyword1\":\"capitals\",\"navigationKeyword2\":\"europe\",\"isPrivate\":false," + ItemJson + "}",
                UserToken),
            "bulk" => await SendAsync(HttpMethod.Post, "/items/bulk",
                "{\"isPrivate\":true,\"category\":\"geography\",\"keyword1\":\"capitals\",\"keyword2\":\"europe\",\"keywords\":[],\"items\":[{" + ItemJson + "}]}",
                AdminToken),
            _ => await SendAsync(HttpMethod.Post, "/items/upload-to-collection",
                "{\"category\":\"geography\",\"keyword1\":\"capitals\",\"keyword2\":\"europe\",\"keywords\":[],\"inputText\":\"qi-" + Guid.NewGuid() + "\",\"items\":[{" + ItemJson + "}]}",
                UserToken)
        };

        status.Should().BeOneOf([HttpStatusCode.OK, HttpStatusCode.Created], body);
        using ApplicationDbContext db = CreateDbContext();
        List<Item> saved = await db.Items.AsNoTracking().ToListAsync();
        saved.Should().ContainSingle();
        saved[0].QuestionImageKey.Should().BeNull();
        saved[0].QuestionImageAlt.Should().BeNull();
    }

    [Fact]
    public async Task Export_IncludesQuestionImage_AndNullWhenAbsent()
    {
        Item picture = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Which flag?", "France", ["Italy"], "x", false, _ownerId.ToString());
        picture.QuestionImageKey = "curated:flags/fr";
        picture.QuestionImageAlt = "Three bands";
        await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Capital of France?", "Paris", ["Lyon"], "x", false, _ownerId.ToString());
        await DbContext.SaveChangesAsync();

        (HttpStatusCode status, string body) = await SendAsync(HttpMethod.Get, "/items/export?category=geography", null, UserToken);

        status.Should().Be(HttpStatusCode.OK, body);
        using JsonDocument doc = JsonDocument.Parse(body);
        JsonElement[] items = doc.RootElement.EnumerateArray().ToArray();
        items.Should().HaveCount(2);
        JsonElement withImage = items.Single(i => i.GetProperty("question").GetString() == "Which flag?");
        withImage.GetProperty("questionImage").GetProperty("key").GetString().Should().Be("curated:flags/fr");
        withImage.GetProperty("questionImage").GetProperty("altText").GetString().Should().Be("Three bands");
        JsonElement without = items.Single(i => i.GetProperty("question").GetString() == "Capital of France?");
        without.GetProperty("questionImage").ValueKind.Should().Be(JsonValueKind.Null);
    }
}
