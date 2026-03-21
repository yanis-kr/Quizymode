using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class KeywordRelationConfiguration : IEntityTypeConfiguration<KeywordRelation>
{
    public void Configure(EntityTypeBuilder<KeywordRelation> builder)
    {
        builder.ToTable("KeywordRelations");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.CategoryId).IsRequired();
        builder.Property(x => x.ChildKeywordId).IsRequired();
        builder.Property(x => x.SortOrder).IsRequired().HasDefaultValue(0);
        builder.Property(x => x.Description).HasMaxLength(500).IsRequired(false);
        builder.Property(x => x.IsPrivate).IsRequired().HasDefaultValue(false);
        builder.Property(x => x.CreatedBy).HasMaxLength(100).IsRequired(false);
        builder.Property(x => x.IsReviewPending).IsRequired().HasDefaultValue(false);
        builder.Property(x => x.ReviewedAt).IsRequired(false);
        builder.Property(x => x.ReviewedBy).HasMaxLength(100).IsRequired(false);
        builder.Property(x => x.CreatedAt).IsRequired();

        builder.HasIndex(x => new { x.CategoryId, x.ParentKeywordId, x.ChildKeywordId })
            .IsUnique();

        builder.HasOne(x => x.Category)
            .WithMany()
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.ParentKeyword)
            .WithMany()
            .HasForeignKey(x => x.ParentKeywordId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.ChildKeyword)
            .WithMany()
            .HasForeignKey(x => x.ChildKeywordId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
