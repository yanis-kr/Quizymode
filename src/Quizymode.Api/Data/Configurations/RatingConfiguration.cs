using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class RatingConfiguration : IEntityTypeConfiguration<Rating>
{
    public void Configure(EntityTypeBuilder<Rating> builder)
    {
        builder.ToTable("Ratings");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.ItemId)
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

        // Indexes for common queries
        builder.HasIndex(x => x.ItemId);
        builder.HasIndex(x => new { x.ItemId, x.CreatedBy }); // For finding user's rating for an item

        // Check constraint for stars (1-5 or null)
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Ratings_Stars_Range",
            "\"Stars\" IS NULL OR (\"Stars\" >= 1 AND \"Stars\" <= 5)"));
    }
}

