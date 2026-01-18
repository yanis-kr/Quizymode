using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class ItemKeywordConfiguration : IEntityTypeConfiguration<ItemKeyword>
{
    public void Configure(EntityTypeBuilder<ItemKeyword> builder)
    {
        builder.ToTable("ItemKeywords");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.ItemId)
            .IsRequired();

        builder.Property(x => x.KeywordId)
            .IsRequired();

        builder.Property(x => x.AddedAt)
            .IsRequired();

        // Unique constraint: an item cannot have the same keyword twice
        builder.HasIndex(x => new { x.ItemId, x.KeywordId })
            .IsUnique();

        // Indexes for common queries
        builder.HasIndex(x => x.ItemId);
        builder.HasIndex(x => x.KeywordId);

        // Foreign key relationships
        builder.HasOne(x => x.Keyword)
            .WithMany()
            .HasForeignKey(x => x.KeywordId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

