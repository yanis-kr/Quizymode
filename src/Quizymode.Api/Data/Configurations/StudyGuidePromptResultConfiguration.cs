using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudyGuidePromptResultConfiguration : IEntityTypeConfiguration<StudyGuidePromptResult>
{
    public void Configure(EntityTypeBuilder<StudyGuidePromptResult> builder)
    {
        builder.ToTable("StudyGuidePromptResults");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(x => x.RawResponseText).IsRequired();
        builder.Property(x => x.ParsedItemsJson);
        builder.Property(x => x.ValidationStatus).IsRequired();
        builder.Property(x => x.ValidationMessagesJson).HasMaxLength(4000);
        builder.Property(x => x.CreatedUtc).IsRequired();
        builder.Property(x => x.UpdatedUtc).IsRequired();
        builder.HasIndex(x => new { x.ImportSessionId, x.ChunkIndex }).IsUnique();
        builder.HasOne(x => x.ImportSession).WithMany().HasForeignKey(x => x.ImportSessionId).OnDelete(DeleteBehavior.Cascade);
    }
}
