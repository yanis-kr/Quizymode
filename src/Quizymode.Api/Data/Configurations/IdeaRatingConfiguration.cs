using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class IdeaRatingConfiguration : IEntityTypeConfiguration<IdeaRating>
{
    public void Configure(EntityTypeBuilder<IdeaRating> builder)
    {
        builder.ToTable("IdeaRatings");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.IdeaId)
            .IsRequired();

        builder.Property(x => x.Stars)
            .IsRequired(false);

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.Property(x => x.UpdatedAt)
            .IsRequired(false);

        builder.HasIndex(x => x.IdeaId);
        builder.HasIndex(x => new { x.IdeaId, x.CreatedBy })
            .IsUnique();
        builder.HasIndex(x => new { x.IdeaId, x.Stars });

        builder.HasOne<Idea>()
            .WithMany()
            .HasForeignKey(x => x.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_IdeaRatings_Stars_Range",
            "\"Stars\" IS NULL OR (\"Stars\" >= 1 AND \"Stars\" <= 5)"));
    }
}
