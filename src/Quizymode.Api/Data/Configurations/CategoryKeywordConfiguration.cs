using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CategoryKeywordConfiguration : IEntityTypeConfiguration<CategoryKeyword>
{
    public void Configure(EntityTypeBuilder<CategoryKeyword> builder)
    {
        builder.ToTable("CategoryKeywords");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.CategoryId)
            .IsRequired();

        builder.Property(x => x.KeywordId)
            .IsRequired();

        builder.Property(x => x.NavigationRank)
            .IsRequired(false);

        builder.Property(x => x.ParentName)
            .IsRequired(false)
            .HasMaxLength(30);

        builder.Property(x => x.SortRank)
            .IsRequired()
            .HasDefaultValue(0);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        // Unique constraint: a keyword can only have one navigation definition per category
        builder.HasIndex(x => new { x.CategoryId, x.KeywordId })
            .IsUnique();

        // Index for querying navigation keywords by category and rank
        builder.HasIndex(x => new { x.CategoryId, x.NavigationRank });

        // Index for querying rank-2 keywords by parent
        builder.HasIndex(x => new { x.CategoryId, x.ParentName });

        // Foreign key relationships
        builder.HasOne(x => x.Category)
            .WithMany()
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.Keyword)
            .WithMany()
            .HasForeignKey(x => x.KeywordId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
