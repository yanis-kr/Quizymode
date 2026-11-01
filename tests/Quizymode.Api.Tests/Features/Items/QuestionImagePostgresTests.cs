using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>
/// #407: the AddItemQuestionImage migration applies, the columns round-trip and the two-way check constraint
/// (key and alt together or neither) is enforced by PostgreSQL. The SQLite fixture strips check constraints,
/// so this must run against the real database. Requires Docker.
/// </summary>
[Trait("Category", "Postgres")]
public sealed class QuestionImagePostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    [SkippableFact]
    public async Task QuestionImage_RoundTrips()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        Guid pictureId;
        Guid plainId;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            Item picture = VisibilitySeed.AddItem(db, category, "owner", false);
            picture.QuestionImageKey = "curated:flags/fr";
            picture.QuestionImageAlt = "Blue, white, red bands";
            Item plain = VisibilitySeed.AddItem(db, category, "owner", false);
            pictureId = picture.Id;
            plainId = plain.Id;
            await db.SaveChangesAsync();
        }

        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Item picture = await db.Items.AsNoTracking().SingleAsync(i => i.Id == pictureId);
            picture.QuestionImageKey.Should().Be("curated:flags/fr");
            picture.QuestionImageAlt.Should().Be("Blue, white, red bands");
            Item plain = await db.Items.AsNoTracking().SingleAsync(i => i.Id == plainId);
            plain.QuestionImageKey.Should().BeNull();
            plain.QuestionImageAlt.Should().BeNull();
        }
    }

    [SkippableTheory]
    [InlineData("curated:flags/fr", null)]
    [InlineData(null, "alt without a key")]
    public async Task CheckConstraint_RejectsKeyWithoutAltAndAltWithoutKey(string? key, string? alt)
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category category = VisibilitySeed.AddCategory(db);
        Item item = VisibilitySeed.AddItem(db, category, "owner", false);
        item.QuestionImageKey = key;
        item.QuestionImageAlt = alt;

        Func<Task> save = () => db.SaveChangesAsync();
        await save.Should().ThrowAsync<DbUpdateException>();
    }

    [SkippableFact]
    public async Task Columns_RejectOverLengthValues()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        await using ApplicationDbContext db = fixture.CreateDbContext();
        Category category = VisibilitySeed.AddCategory(db);
        Item item = VisibilitySeed.AddItem(db, category, "owner", false);
        item.QuestionImageKey = "curated:flags/" + new string('a', 100);
        item.QuestionImageAlt = "alt";

        Func<Task> save = () => db.SaveChangesAsync();
        await save.Should().ThrowAsync<DbUpdateException>();
    }
}
