using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class KeywordConfiguration : IEntityTypeConfiguration<Keyword>
{
    public void Configure(EntityTypeBuilder<Keyword> builder)
    {
        builder.ToTable("keywords");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(30);

        builder.Property(x => x.IsPrivate)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        // Unique index on Name + CreatedBy + IsPrivate to prevent duplicates
        // For global keywords (IsPrivate=false), Name must be unique globally
        // For private keywords (IsPrivate=true), Name must be unique per user
        builder.HasIndex(x => new { x.Name, x.CreatedBy, x.IsPrivate })
            .IsUnique();

        // Index for filtering by visibility
        builder.HasIndex(x => x.IsPrivate);
        builder.HasIndex(x => x.CreatedBy);
    }
}

