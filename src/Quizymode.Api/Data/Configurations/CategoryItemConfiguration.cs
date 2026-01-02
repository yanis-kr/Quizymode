using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CategoryItemConfiguration : IEntityTypeConfiguration<CategoryItem>
{
    public void Configure(EntityTypeBuilder<CategoryItem> builder)
    {
        builder.ToTable("CategoryItems");

        // Composite Primary Key
        builder.HasKey(ci => new { ci.CategoryId, ci.ItemId });

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        // Foreign keys
        builder.HasOne(ci => ci.Category)
            .WithMany(c => c.CategoryItems)
            .HasForeignKey(ci => ci.CategoryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(ci => ci.Item)
            .WithMany(i => i.CategoryItems)
            .HasForeignKey(ci => ci.ItemId)
            .OnDelete(DeleteBehavior.Cascade);

        // Indexes for performance
        builder.HasIndex(x => new { x.ItemId, x.CategoryId });
        builder.HasIndex(x => x.CategoryId);
    }
}

