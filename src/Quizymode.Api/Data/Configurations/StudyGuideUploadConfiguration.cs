using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudyGuideUploadConfiguration : IEntityTypeConfiguration<StudyGuideUpload>
{
    public void Configure(EntityTypeBuilder<StudyGuideUpload> builder)
    {
        builder.ToTable("StudyGuideUploads");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
        builder.Property(x => x.TextHash).IsRequired().HasMaxLength(64);
        builder.Property(x => x.InputText).IsRequired();
        builder.Property(x => x.CategoryName).IsRequired().HasMaxLength(200);
        builder.Property(x => x.NavigationKeyword1).IsRequired().HasMaxLength(30);
        builder.Property(x => x.NavigationKeyword2).IsRequired().HasMaxLength(30);
        builder.Property(x => x.KeywordsJson).HasMaxLength(2000);
        builder.Property(x => x.Status).IsRequired();
        builder.Property(x => x.Error).HasMaxLength(1000);
        builder.Property(x => x.CreatedUtc).IsRequired();
        builder.Property(x => x.UpdatedUtc).IsRequired();
        builder.HasIndex(x => new { x.UserId, x.TextHash }).IsUnique();
        builder.HasIndex(x => x.Status);
    }
}
