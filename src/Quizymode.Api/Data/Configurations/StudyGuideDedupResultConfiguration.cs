using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class StudyGuideDedupResultConfiguration : IEntityTypeConfiguration<StudyGuideDedupResult>
{
    public void Configure(EntityTypeBuilder<StudyGuideDedupResult> builder)
    {
        builder.ToTable("StudyGuideDedupResults");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(x => x.RawDedupResponseText).IsRequired();
        builder.Property(x => x.ParsedDedupItemsJson);
        builder.Property(x => x.ValidationStatus).IsRequired();
        builder.Property(x => x.CreatedUtc).IsRequired();
        builder.HasIndex(x => x.ImportSessionId).IsUnique();
        builder.HasOne(x => x.ImportSession).WithMany().HasForeignKey(x => x.ImportSessionId).OnDelete(DeleteBehavior.Cascade);
    }
}
