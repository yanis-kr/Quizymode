using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class FeedbackSubmissionConfiguration : IEntityTypeConfiguration<FeedbackSubmission>
{
    public void Configure(EntityTypeBuilder<FeedbackSubmission> builder)
    {
        builder.ToTable("FeedbackSubmissions");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.Type)
            .IsRequired()
            .HasMaxLength(32);

        builder.Property(x => x.PageUrl)
            .IsRequired()
            .HasMaxLength(2048);

        builder.Property(x => x.Details)
            .IsRequired()
            .HasMaxLength(4000);

        builder.Property(x => x.Email)
            .HasMaxLength(320);

        builder.Property(x => x.AdditionalKeywords)
            .HasMaxLength(500);

        builder.Property(x => x.UserAgent)
            .HasMaxLength(512);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.HasIndex(x => x.CreatedAt);
        builder.HasIndex(x => x.Type);
        builder.HasIndex(x => x.UserId);
    }
}
