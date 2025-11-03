using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CollectionConfiguration : IEntityTypeConfiguration<Collection>
{
    public void Configure(EntityTypeBuilder<Collection> builder)
    {
        builder.ToTable("collections");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.Description)
            .HasMaxLength(1000);

        builder.Property(x => x.CategoryId)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.SubcategoryId)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.Visibility)
            .IsRequired()
            .HasMaxLength(20)
            .HasDefaultValue("global");

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.Property(x => x.ItemCount)
            .IsRequired()
            .HasDefaultValue(0);

        // Indexes for common queries
        builder.HasIndex(x => new { x.CategoryId, x.SubcategoryId });
        builder.HasIndex(x => x.CreatedAt);
    }
}

