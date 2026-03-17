using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudyGuideChunkConfiguration : IEntityTypeConfiguration<StudyGuideChunk>
{
    public void Configure(EntityTypeBuilder<StudyGuideChunk> builder)
    {
        builder.ToTable("StudyGuideChunks");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(x => x.Title).IsRequired().HasMaxLength(500);
        builder.Property(x => x.ChunkText).IsRequired();
        builder.Property(x => x.PromptText).IsRequired();
        builder.Property(x => x.CreatedUtc).IsRequired();
        builder.HasIndex(x => new { x.ImportSessionId, x.ChunkIndex }).IsUnique();
        builder.HasOne(x => x.ImportSession).WithMany().HasForeignKey(x => x.ImportSessionId).OnDelete(DeleteBehavior.Cascade);
    }
}
