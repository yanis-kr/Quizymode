using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class SeedSyncRunConfiguration : IEntityTypeConfiguration<SeedSyncRun>
{
    public void Configure(EntityTypeBuilder<SeedSyncRun> builder)
    {
        builder.ToTable("SeedSyncRuns");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.RepositoryOwner)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.RepositoryName)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.GitRef)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.ResolvedCommitSha)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(x => x.ItemsPath)
            .IsRequired()
            .HasMaxLength(300);

        builder.Property(x => x.SeedSet)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.SourceFileCount).IsRequired();
        builder.Property(x => x.TotalItemsInPayload).IsRequired();
        builder.Property(x => x.ExistingItemCount).IsRequired();
        builder.Property(x => x.CreatedCount).IsRequired();
        builder.Property(x => x.UpdatedCount).IsRequired();
        builder.Property(x => x.DeletedCount).IsRequired();
        builder.Property(x => x.UnchangedCount).IsRequired();

        builder.Property(x => x.TriggeredByUserId)
            .HasMaxLength(100)
            .IsRequired(false);

        builder.Property(x => x.CreatedUtc)
            .IsRequired();

        builder.HasIndex(x => x.CreatedUtc);
        builder.HasIndex(x => x.ResolvedCommitSha);
        builder.HasIndex(x => x.TriggeredByUserId);
    }
}
