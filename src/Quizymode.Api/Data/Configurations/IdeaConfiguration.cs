using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class IdeaConfiguration : IEntityTypeConfiguration<Idea>
{
    public void Configure(EntityTypeBuilder<Idea> builder)
    {
        builder.ToTable("Ideas");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.Problem)
            .IsRequired()
            .HasMaxLength(4000);

        builder.Property(x => x.ProposedChange)
            .IsRequired()
            .HasMaxLength(4000);

        builder.Property(x => x.TradeOffs)
            .HasMaxLength(4000);

        builder.Property(x => x.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(x => x.ModerationState)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(x => x.ModerationNotes)
            .HasMaxLength(1000);

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.Property(x => x.UpdatedAt)
            .IsRequired(false);

        builder.Property(x => x.ReviewedBy)
            .HasMaxLength(100);

        builder.Property(x => x.ReviewedAt)
            .IsRequired(false);

        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.ModerationState);
        builder.HasIndex(x => x.CreatedAt);
        builder.HasIndex(x => x.UpdatedAt);
        builder.HasIndex(x => x.CreatedBy);
        builder.HasIndex(x => new { x.CreatedBy, x.ModerationState });
    }
}
