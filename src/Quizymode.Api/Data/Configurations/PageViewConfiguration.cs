using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class PageViewConfiguration : IEntityTypeConfiguration<PageView>
{
    public void Configure(EntityTypeBuilder<PageView> builder)
    {
        builder.ToTable("PageViews");

        builder.HasKey(pageView => pageView.Id);

        builder.Property(pageView => pageView.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(pageView => pageView.UserId);

        builder.Property(pageView => pageView.IsAuthenticated)
            .IsRequired();

        builder.Property(pageView => pageView.SessionId)
            .IsRequired()
            .HasMaxLength(128);

        builder.Property(pageView => pageView.IpAddress)
            .IsRequired()
            .HasMaxLength(45);

        builder.Property(pageView => pageView.Path)
            .IsRequired()
            .HasMaxLength(2048);

        builder.Property(pageView => pageView.QueryString)
            .IsRequired()
            .HasMaxLength(2048);

        builder.Property(pageView => pageView.Url)
            .IsRequired()
            .HasMaxLength(4096);

        builder.Property(pageView => pageView.UserAgent)
            .HasMaxLength(512);

        builder.Property(pageView => pageView.IsBot)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(pageView => pageView.IsInternal)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(pageView => pageView.Area)
            .HasMaxLength(32);

        builder.Property(pageView => pageView.ScopeType)
            .HasMaxLength(16);

        builder.Property(pageView => pageView.ScopeKey)
            .HasMaxLength(200);

        builder.Property(pageView => pageView.NavPath)
            .HasMaxLength(400);

        builder.Property(pageView => pageView.IsItemStep)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(pageView => pageView.CreatedUtc)
            .IsRequired();

        builder.HasIndex(pageView => pageView.CreatedUtc);
        builder.HasIndex(pageView => pageView.Path);
        builder.HasIndex(pageView => pageView.SessionId);
        builder.HasIndex(pageView => pageView.UserId);
        builder.HasIndex(pageView => pageView.IsAuthenticated);
        builder.HasIndex(pageView => pageView.IsBot);
        builder.HasIndex(pageView => pageView.IsInternal);
        builder.HasIndex(pageView => new { pageView.Path, pageView.CreatedUtc });
        builder.HasIndex(pageView => new { pageView.SessionId, pageView.CreatedUtc });
        builder.HasIndex(pageView => new { pageView.Area, pageView.CreatedUtc });
    }
}
