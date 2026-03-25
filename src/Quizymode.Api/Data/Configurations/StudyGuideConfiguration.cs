using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudyGuideConfiguration : IEntityTypeConfiguration<StudyGuide>
{
    public void Configure(EntityTypeBuilder<StudyGuide> builder)
    {
        builder.ToTable("StudyGuides");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.UserId)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(x => x.ContentText)
            .IsRequired();

        builder.Property(x => x.SizeBytes)
            .IsRequired();

        builder.Property(x => x.CreatedUtc)
            .IsRequired();

        builder.Property(x => x.UpdatedUtc)
            .IsRequired();

        builder.HasIndex(x => x.UserId)
            .IsUnique();
    }
}
