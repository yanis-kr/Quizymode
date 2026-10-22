using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudySessionConfiguration : IEntityTypeConfiguration<StudySession>
{
    public void Configure(EntityTypeBuilder<StudySession> builder)
    {
        builder.ToTable("StudySessions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
        builder.Property(x => x.RunId).IsRequired().HasMaxLength(128);
        builder.Property(x => x.Origin).IsRequired().HasMaxLength(16);
        builder.Property(x => x.Mode).IsRequired().HasMaxLength(16).HasDefaultValue("quiz");
        builder.Property(x => x.CompletedAt).IsRequired();
        builder.Property(x => x.CreatedAt).IsRequired();
        builder.Property(x => x.Correct).IsRequired();
        builder.Property(x => x.Total).IsRequired();
        builder.Property(x => x.SourceKind).HasMaxLength(16);
        builder.Property(x => x.SourceCategorySlug).HasMaxLength(64);
        builder.Property(x => x.NavigationKeywords).IsRequired().HasMaxLength(400);
        builder.Property(x => x.FilterKeywords).IsRequired().HasMaxLength(400);

        builder.HasIndex(x => new { x.UserId, x.RunId }).IsUnique();
        builder.HasIndex(x => new { x.UserId, x.CompletedAt });

        builder.HasMany(x => x.MissedItems)
            .WithOne()
            .HasForeignKey(x => x.StudySessionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_StudySessions_Counts",
            "\"Total\" > 0 AND \"Correct\" >= 0 AND \"Correct\" <= \"Total\""));
    }
}

internal sealed class StudySessionMissedItemConfiguration : IEntityTypeConfiguration<StudySessionMissedItem>
{
    public void Configure(EntityTypeBuilder<StudySessionMissedItem> builder)
    {
        builder.ToTable("StudySessionMissedItems");
        builder.HasKey(x => new { x.StudySessionId, x.ItemId });
    }
}
