using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class FeaturedItemConfiguration : IEntityTypeConfiguration<FeaturedItem>
{
    public void Configure(EntityTypeBuilder<FeaturedItem> builder)
    {
        builder.ToTable("FeaturedItems");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.Type)
            .IsRequired();

        builder.Property(x => x.DisplayName)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.CategorySlug)
            .HasMaxLength(50)
            .IsRequired(false);

        builder.Property(x => x.NavKeyword1)
            .HasMaxLength(100)
            .IsRequired(false);

        builder.Property(x => x.NavKeyword2)
            .HasMaxLength(100)
            .IsRequired(false);

        builder.Property(x => x.CollectionId)
            .IsRequired(false);

        builder.HasOne(x => x.Collection)
            .WithMany()
            .HasForeignKey(x => x.CollectionId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Property(x => x.SortOrder)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.HasIndex(x => x.Type);
        builder.HasIndex(x => x.SortOrder);
    }
}
