using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CollectionRatingConfiguration : IEntityTypeConfiguration<CollectionRating>
{
    public void Configure(EntityTypeBuilder<CollectionRating> builder)
    {
        builder.ToTable("CollectionRatings");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.CollectionId).IsRequired();
        builder.Property(x => x.Stars).IsRequired();
        builder.Property(x => x.CreatedBy).IsRequired().HasMaxLength(100);
        builder.Property(x => x.CreatedAt).IsRequired();
        builder.Property(x => x.UpdatedAt).IsRequired(false);

        builder.HasIndex(x => x.CollectionId);
        builder.HasIndex(x => new { x.CollectionId, x.CreatedBy }).IsUnique();

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_CollectionRatings_Stars_Range",
            "\"Stars\" >= 1 AND \"Stars\" <= 5"));
    }
}
