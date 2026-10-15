using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class AnalyticsEventConfiguration : IEntityTypeConfiguration<AnalyticsEvent>
{
    public void Configure(EntityTypeBuilder<AnalyticsEvent> builder)
    {
        builder.ToTable("AnalyticsEvents");

        builder.HasKey(analyticsEvent => analyticsEvent.Id);

        builder.Property(analyticsEvent => analyticsEvent.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(analyticsEvent => analyticsEvent.EventName)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(analyticsEvent => analyticsEvent.SessionId)
            .IsRequired()
            .HasMaxLength(128);

        builder.Property(analyticsEvent => analyticsEvent.IsAuthenticated)
            .IsRequired();

        builder.Property(analyticsEvent => analyticsEvent.Path)
            .IsRequired()
            .HasMaxLength(512);

        builder.Property(analyticsEvent => analyticsEvent.ContextType)
            .HasMaxLength(32);

        builder.Property(analyticsEvent => analyticsEvent.ContextId)
            .HasMaxLength(128);

        builder.Property(analyticsEvent => analyticsEvent.RunId)
            .HasMaxLength(64);

        builder.Property(analyticsEvent => analyticsEvent.DedupeKey)
            .HasMaxLength(200);

        builder.Property(analyticsEvent => analyticsEvent.UserAgent)
            .HasMaxLength(512);

        builder.Property(analyticsEvent => analyticsEvent.IsBot)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(analyticsEvent => analyticsEvent.IsInternal)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(analyticsEvent => analyticsEvent.OccurredUtc)
            .IsRequired();

        builder.HasIndex(analyticsEvent => analyticsEvent.OccurredUtc);
        builder.HasIndex(analyticsEvent => new { analyticsEvent.EventName, analyticsEvent.OccurredUtc });
        builder.HasIndex(analyticsEvent => analyticsEvent.SessionId);
        builder.HasIndex(analyticsEvent => analyticsEvent.UserId);
        builder.HasIndex(analyticsEvent => analyticsEvent.RunId);
        builder.HasIndex(analyticsEvent => analyticsEvent.IsInternal);

        // The database, not the client, is the final guard against duplicate completions.
        builder.HasIndex(analyticsEvent => new { analyticsEvent.SessionId, analyticsEvent.DedupeKey })
            .IsUnique()
            .HasFilter("\"DedupeKey\" IS NOT NULL");
    }
}
