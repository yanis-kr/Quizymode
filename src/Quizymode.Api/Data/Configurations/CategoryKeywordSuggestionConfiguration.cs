using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CategoryKeywordSuggestionConfiguration : IEntityTypeConfiguration<CategoryKeywordSuggestion>
{
    public void Configure(EntityTypeBuilder<CategoryKeywordSuggestion> builder)
    {
        builder.ToTable("CategoryKeywordSuggestions");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.CategoryId)
            .IsRequired();

        builder.Property(x => x.KeywordId)
            .IsRequired();

        builder.Property(x => x.RequestedRank)
            .IsRequired();

        builder.Property(x => x.RequestedParentName)
            .HasMaxLength(30)
            .IsRequired(false);

        builder.Property(x => x.RequestedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.RequestedAt)
            .IsRequired();

        builder.Property(x => x.Status)
            .IsRequired()
            .HasMaxLength(20);

        builder.Property(x => x.ReviewedBy)
            .HasMaxLength(100);

        builder.Property(x => x.ReviewNotes)
            .HasMaxLength(500);

        builder.HasIndex(x => new { x.CategoryId, x.KeywordId, x.RequestedRank, x.RequestedParentName, x.Status });

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

