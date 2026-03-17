using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudyGuideImportSessionConfiguration : IEntityTypeConfiguration<StudyGuideImportSession>
{
    public void Configure(EntityTypeBuilder<StudyGuideImportSession> builder)
    {
        builder.ToTable("StudyGuideImportSessions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
        builder.Property(x => x.CategoryName).IsRequired().HasMaxLength(200);
        builder.Property(x => x.NavigationKeywordPathJson).IsRequired().HasMaxLength(2000);
        builder.Property(x => x.DefaultKeywordsJson).HasMaxLength(2000);
        builder.Property(x => x.Status).IsRequired();
        builder.Property(x => x.CreatedUtc).IsRequired();
        builder.Property(x => x.UpdatedUtc).IsRequired();
        builder.HasIndex(x => x.StudyGuideId);
        builder.HasIndex(x => x.UserId);
        builder.HasOne(x => x.StudyGuide).WithMany().HasForeignKey(x => x.StudyGuideId).OnDelete(DeleteBehavior.Cascade);
    }
}
