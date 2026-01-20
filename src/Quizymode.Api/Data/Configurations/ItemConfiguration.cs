using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class ItemConfiguration : IEntityTypeConfiguration<Item>
{
    public void Configure(EntityTypeBuilder<Item> builder)
    {
        builder.ToTable("Items");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.IsPrivate)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(x => x.Question)
            .IsRequired()
            .HasMaxLength(1000);

        builder.Property(x => x.CorrectAnswer)
            .IsRequired()
            .HasMaxLength(500);

        // Map List<string> to JSONB column
        // EF Core with Npgsql requires explicit conversion for JSONB
        builder.Property(x => x.IncorrectAnswers)
            .HasColumnType("jsonb")
            .HasConversion(
                v => System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null!),
                v => System.Text.Json.JsonSerializer.Deserialize<List<string>>(v, (System.Text.Json.JsonSerializerOptions?)null!) ?? new List<string>(),
                new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
                    (c1, c2) => c1 != null && c2 != null && c1.SequenceEqual(c2),
                    c => c.Aggregate(0, (a, v) => HashCode.Combine(a, v.GetHashCode())),
                    c => c.ToList()))
            .IsRequired();

        builder.Property(x => x.Explanation)
            .HasMaxLength(2000);

        builder.Property(x => x.FuzzySignature)
            .HasMaxLength(64);

        builder.Property(x => x.FuzzyBucket)
            .IsRequired();

        builder.Property(x => x.CreatedBy)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.Property(x => x.ReadyForReview)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(x => x.CategoryId)
            .IsRequired(false);

        // Foreign key relationship to Category
        builder.HasOne(x => x.Category)
            .WithMany(c => c.Items)
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        // Add check constraint for incorrect answers array length (0-4 items)
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Items_IncorrectAnswers_Length",
            "jsonb_array_length(\"IncorrectAnswers\"::jsonb) >= 0 AND jsonb_array_length(\"IncorrectAnswers\"::jsonb) <= 4"));

        // Indexes for common queries
        builder.HasIndex(x => x.FuzzyBucket);
        builder.HasIndex(x => x.CreatedAt);
        builder.HasIndex(x => x.CategoryId);
        
        // Composite indexes for category queries with visibility filtering
        builder.HasIndex(x => new { x.CategoryId, x.IsPrivate });
        builder.HasIndex(x => new { x.IsPrivate, x.CreatedBy });
    }
}

