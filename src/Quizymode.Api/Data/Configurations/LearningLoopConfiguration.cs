using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class ReviewQueueEntryConfiguration : IEntityTypeConfiguration<ReviewQueueEntry>
{
    public void Configure(EntityTypeBuilder<ReviewQueueEntry> builder)
    {
        builder.ToTable("ReviewQueueEntries");
        builder.HasKey(x => new { x.UserId, x.ItemId });
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
        builder.Property(x => x.DueAt).IsRequired();
        builder.Property(x => x.ItemVersionAt).IsRequired();
        builder.HasIndex(x => new { x.UserId, x.DueAt });
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_ReviewQueueEntries_IntervalIndex",
            "\"IntervalIndex\" >= 0 AND \"IntervalIndex\" < 5"));
    }
}

internal sealed class DailyQuizSetConfiguration : IEntityTypeConfiguration<DailyQuizSet>
{
    public void Configure(EntityTypeBuilder<DailyQuizSet> builder)
    {
        builder.ToTable("DailyQuizSets");
        builder.HasKey(x => x.Date);
    }
}

internal sealed class DailyQuizItemConfiguration : IEntityTypeConfiguration<DailyQuizItem>
{
    public void Configure(EntityTypeBuilder<DailyQuizItem> builder)
    {
        builder.ToTable("DailyQuizItems");
        builder.HasKey(x => new { x.Date, x.ItemId });
        builder.Property(x => x.ExcludedBy).HasMaxLength(100);
        builder.HasIndex(x => x.ItemId);
    }
}

internal sealed class DailyQuizCompletionConfiguration : IEntityTypeConfiguration<DailyQuizCompletion>
{
    public void Configure(EntityTypeBuilder<DailyQuizCompletion> builder)
    {
        builder.ToTable("DailyQuizCompletions");
        builder.HasKey(x => new { x.UserId, x.Date });
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
        builder.ToTable(t => t.HasCheckConstraint(
            "CK_DailyQuizCompletions_Counts",
            "\"Total\" > 0 AND \"Correct\" >= 0 AND \"Correct\" <= \"Total\""));
    }
}

internal sealed class UserInterestConfiguration : IEntityTypeConfiguration<UserInterest>
{
    public void Configure(EntityTypeBuilder<UserInterest> builder)
    {
        builder.ToTable("UserInterests");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.HasIndex(x => new { x.UserId, x.CategoryId, x.NavigationKeywordId1, x.NavigationKeywordId2 })
            .IsUnique().AreNullsDistinct(false);
        builder.HasOne<Keyword>().WithMany().HasForeignKey(x => x.NavigationKeywordId1).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Keyword>().WithMany().HasForeignKey(x => x.NavigationKeywordId2).OnDelete(DeleteBehavior.Cascade);
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
    }
}
