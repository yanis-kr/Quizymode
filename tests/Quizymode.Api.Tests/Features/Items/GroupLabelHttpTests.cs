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
using Quizymode.Api.Features.Items.Update;
using Quizymode.Api.Features.Items.UploadToCollection;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>#359: the optional group label over HTTP on every write path (add, update, bulk, upload-to-collection).</summary>
public sealed class GroupLabelHttpTests : ItemTestFixture, IAsyncLifetime
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
                services.AddScoped<IValidator<UpdateItem.Request>, UpdateItem.Validator>();
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
                new UpdateItem.Endpoint().MapEndpoint(app);
                new AddItemsBulk.Endpoint().MapEndpoint(app);
                new UploadItemsToCollection.Endpoint().MapEndpoint(app);
            });

        _ownerId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = _ownerId, Subject = "owner-sub", Email = "owner@example.com", Name = "owner" });
        await DbContext.SaveChangesAsync();
        await EnsureGeographyPublicWithNavAsync(_ownerId.ToString());
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private string UserToken => _host.CreateToken("owner-sub", "owner@example.com");

    private string AdminToken => _host.CreateToken("owner-sub", "owner@example.com", AdminGroups);

    private static string Json(string? groupLabelJson)
    {
        string label = groupLabelJson is null ? string.Empty : ",\"groupLabel\":" + groupLabelJson;
        return "\"question\":\"Q?\",\"correctAnswer\":\"A\",\"incorrectAnswers\":[\"B\"],\"explanation\":\"\"" + label;
    }

    private async Task<(HttpStatusCode Status, string Body)> SendAsync(HttpMethod method, string path, string json, string token)
    {
        using StringContent content = new(json, Encoding.UTF8, "application/json");
        using HttpRequestMessage request = JwtHttpTestHost.Request(method, path, token, content);
        using HttpResponseMessage response = await _host.Client.SendAsync(request);
        return (response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    private Task<(HttpStatusCode Status, string Body)> AddAsync(string? label) =>
        SendAsync(HttpMethod.Post, "/items",
            "{\"category\":\"geography\",\"navigationKeyword1\":\"capitals\",\"navigationKeyword2\":\"europe\",\"isPrivate\":false," + Json(label) + "}",
            UserToken);

    private Task<(HttpStatusCode Status, string Body)> UpdateAsync(Guid id, string? label) =>
        SendAsync(HttpMethod.Put, "/items/" + id,
            "{\"category\":\"geography\",\"navigationKeyword1\":\"capitals\",\"navigationKeyword2\":\"europe\",\"isPrivate\":false," + Json(label) + "}",
            UserToken);

    private Task<(HttpStatusCode Status, string Body)> BulkAsync(string? label) =>
        SendAsync(HttpMethod.Post, "/items/bulk",
            "{\"isPrivate\":true,\"category\":\"geography\",\"keyword1\":\"capitals\",\"keyword2\":\"europe\",\"keywords\":[],\"items\":[{" + Json(label) + "}]}",
            AdminToken);

    private Task<(HttpStatusCode Status, string Body)> UploadAsync(string? label) =>
        SendAsync(HttpMethod.Post, "/items/upload-to-collection",
            "{\"category\":\"geography\",\"keyword1\":\"capitals\",\"keyword2\":\"europe\",\"keywords\":[],\"inputText\":\"gl-" + Guid.NewGuid() + "\",\"items\":[{" + Json(label) + "}]}",
            UserToken);

    private string?[] SavedLabels()
    {
        using ApplicationDbContext db = CreateDbContext();
        return db.Items.AsNoTracking().Select(i => i.GroupLabel).ToArray();
    }

    private static string TooLong => "\"" + new string('x', 31) + "\"";

    public static TheoryData<string> WritePaths => new() { "add", "bulk", "upload" };

    private Task<(HttpStatusCode Status, string Body)> CreateAsync(string path, string? label) => path switch
    {
        "add" => AddAsync(label),
        "bulk" => BulkAsync(label),
        _ => UploadAsync(label)
    };

    [Theory]
    [MemberData(nameof(WritePaths))]
    public async Task Create_LabelOver30Chars_Returns400AndSavesNothing(string path)
    {
        (HttpStatusCode status, string body) = await CreateAsync(path, TooLong);

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("Group label must be 30 characters or fewer.");
        SavedLabels().Should().BeEmpty();
    }

    [Theory]
    [MemberData(nameof(WritePaths))]
    public async Task Create_LabelWithLineBreak_Returns400AndSavesNothing(string path)
    {
        (HttpStatusCode status, string body) = await CreateAsync(path, "\"Mam\\nmals\"");

        status.Should().Be(HttpStatusCode.BadRequest);
        body.Should().Contain("Group label can't contain line breaks.");
        SavedLabels().Should().BeEmpty();
    }

    [Theory]
    [MemberData(nameof(WritePaths))]
    public async Task Create_LabelPaddedToExactly30Chars_IsTrimmedAndSaved(string path)
    {
        string label = new('x', 30);

        (HttpStatusCode status, _) = await CreateAsync(path, "\"  " + label + "  \"");

        status.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.Created);
        SavedLabels().Should().Equal(label);
    }

    [Theory]
    [MemberData(nameof(WritePaths))]
    public async Task Create_BlankLabel_SavesNull(string path)
    {
        (await CreateAsync(path, "\"   \"")).Status.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.Created);
        SavedLabels().Should().Equal((string?)null);
    }

    [Fact]
    public async Task Add_Returns201WithTrimmedGroupLabelInResponse()
    {
        (HttpStatusCode status, string body) = await AddAsync("\" Mammals \"");

        status.Should().Be(HttpStatusCode.Created);
        JsonDocument.Parse(body).RootElement.GetProperty("groupLabel").GetString().Should().Be("Mammals");
    }

    [Fact]
    public async Task Update_LabelOver30CharsOrLineBreak_Returns400AndKeepsStoredLabel()
    {
        Item item = await SeedItemAsync("Mammals");

        (await UpdateAsync(item.Id, TooLong)).Status.Should().Be(HttpStatusCode.BadRequest);
        (await UpdateAsync(item.Id, "\"a\\r\\nb\"")).Status.Should().Be(HttpStatusCode.BadRequest);

        SavedLabels().Should().Equal("Mammals");
    }

    [Fact]
    public async Task Update_SetChangeKeepAndClear()
    {
        Item item = await SeedItemAsync(null);

        (HttpStatusCode setStatus, string setBody) = await UpdateAsync(item.Id, "\" Birds \"");
        setStatus.Should().Be(HttpStatusCode.OK);
        JsonDocument.Parse(setBody).RootElement.GetProperty("groupLabel").GetString().Should().Be("Birds");
        SavedLabels().Should().Equal("Birds");

        (await UpdateAsync(item.Id, "\"Fish\"")).Status.Should().Be(HttpStatusCode.OK);
        SavedLabels().Should().Equal("Fish");

        // Omitted (and explicit null) keeps the stored label.
        (await UpdateAsync(item.Id, null)).Status.Should().Be(HttpStatusCode.OK);
        SavedLabels().Should().Equal("Fish");
        (await UpdateAsync(item.Id, "null")).Status.Should().Be(HttpStatusCode.OK);
        SavedLabels().Should().Equal("Fish");

        // A blank value clears it.
        (HttpStatusCode clearStatus, string clearBody) = await UpdateAsync(item.Id, "\"  \"");
        clearStatus.Should().Be(HttpStatusCode.OK);
        JsonDocument.Parse(clearBody).RootElement.GetProperty("groupLabel").ValueKind.Should().Be(JsonValueKind.Null);
        SavedLabels().Should().Equal((string?)null);
    }

    private async Task<Item> SeedItemAsync(string? label)
    {
        Item item = await CreateItemWithCategoryAsync(
            Guid.NewGuid(), "geography", "Original?", "A", ["B"], "old", false, _ownerId.ToString());
        item.GroupLabel = label;
        await DbContext.SaveChangesAsync();
        return item;
    }
}
