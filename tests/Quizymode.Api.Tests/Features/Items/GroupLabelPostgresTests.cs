using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Items;

/// <summary>#359: the AddItemGroupLabel migration applies and GroupLabel (varchar(30), nullable) round-trips on PostgreSQL. Requires Docker.</summary>
[Trait("Category", "Postgres")]
public sealed class GroupLabelPostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    [SkippableFact]
    public async Task GroupLabel_RoundTripsAndOverLengthIsRejectedByTheDatabase()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

        string thirty = new('g', 30);
        Guid labelledId;
        Guid plainId;
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = VisibilitySeed.AddCategory(db);
            Item labelled = VisibilitySeed.AddItem(db, category, "owner", false);
            labelled.GroupLabel = thirty;
            Item plain = VisibilitySeed.AddItem(db, category, "owner", false);
            labelledId = labelled.Id;
            plainId = plain.Id;
            await db.SaveChangesAsync();
        }

        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            (await db.Items.AsNoTracking().SingleAsync(i => i.Id == labelledId)).GroupLabel.Should().Be(thirty);
            (await db.Items.AsNoTracking().SingleAsync(i => i.Id == plainId)).GroupLabel.Should().BeNull();
        }

        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Item tooLong = await db.Items.SingleAsync(i => i.Id == plainId);
            tooLong.GroupLabel = new string('g', 31);
            Func<Task> save = () => db.SaveChangesAsync();
            await save.Should().ThrowAsync<DbUpdateException>();
        }
    }
}
