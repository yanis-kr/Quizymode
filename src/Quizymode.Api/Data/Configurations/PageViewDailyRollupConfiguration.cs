using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class PageViewDailyRollupConfiguration : IEntityTypeConfiguration<PageViewDailyRollup>
{
    public void Configure(EntityTypeBuilder<PageViewDailyRollup> builder)
    {
        builder.ToTable("PageViewDailyRollups");

        builder.HasKey(rollup => rollup.Id);

        builder.Property(rollup => rollup.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(rollup => rollup.Day).IsRequired();
        builder.Property(rollup => rollup.Area).IsRequired().HasMaxLength(32);
        builder.Property(rollup => rollup.ScopeType).HasMaxLength(16);
        builder.Property(rollup => rollup.ScopeKey).HasMaxLength(200);
        builder.Property(rollup => rollup.Channel).IsRequired().HasMaxLength(32);
        builder.Property(rollup => rollup.DeviceClass).IsRequired().HasMaxLength(16);
        builder.Property(rollup => rollup.Country).HasMaxLength(64);
        builder.Property(rollup => rollup.Outcome).IsRequired().HasMaxLength(16);
        builder.Property(rollup => rollup.VisitorType).IsRequired().HasMaxLength(16);
        builder.Property(rollup => rollup.Hits).IsRequired();
        builder.Property(rollup => rollup.Sessions).IsRequired();
        builder.Property(rollup => rollup.ItemSteps).IsRequired();
        builder.Property(rollup => rollup.BouncedSessions).IsRequired();
        builder.Property(rollup => rollup.CreatedUtc).IsRequired();

        builder.HasIndex(rollup => rollup.Day);
        builder.HasIndex(rollup => new { rollup.Day, rollup.Area });
    }
}
