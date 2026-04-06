using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class SeedSyncItemHistoryConfiguration : IEntityTypeConfiguration<SeedSyncItemHistory>
{
    public void Configure(EntityTypeBuilder<SeedSyncItemHistory> builder)
    {
        builder.ToTable("SeedSyncItemHistories");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.SeedSyncRunId)
            .IsRequired();

        builder.Property(x => x.ItemId)
            .IsRequired();

        builder.Property(x => x.Action)
            .IsRequired()
            .HasConversion<int>();

        builder.Property(x => x.Category)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.NavigationKeyword1)
            .IsRequired()
            .HasMaxLength(30);

        builder.Property(x => x.NavigationKeyword2)
            .IsRequired()
            .HasMaxLength(30);

        builder.Property(x => x.Question)
            .IsRequired()
            .HasMaxLength(1000);

        builder.Property(x => x.ChangedFields)
            .HasColumnType("jsonb")
            .HasConversion(
                v => System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null!),
                v => System.Text.Json.JsonSerializer.Deserialize<List<string>>(v, (System.Text.Json.JsonSerializerOptions?)null!) ?? new List<string>(),
                new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
                    (c1, c2) => c1 != null && c2 != null && c1.SequenceEqual(c2),
                    c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
                    c => c.ToList()))
            .IsRequired();

        builder.Property(x => x.CreatedUtc)
            .IsRequired();

        builder.HasOne(x => x.SeedSyncRun)
            .WithMany(x => x.ItemHistories)
            .HasForeignKey(x => x.SeedSyncRunId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.SeedSyncRunId);
        builder.HasIndex(x => x.ItemId);
        builder.HasIndex(x => x.Action);
        builder.HasIndex(x => x.CreatedUtc);
    }
}
