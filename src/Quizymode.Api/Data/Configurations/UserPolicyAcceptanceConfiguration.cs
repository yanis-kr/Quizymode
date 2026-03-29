using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class UserPolicyAcceptanceConfiguration : IEntityTypeConfiguration<UserPolicyAcceptance>
{
    public void Configure(EntityTypeBuilder<UserPolicyAcceptance> builder)
    {
        builder.ToTable("UserPolicyAcceptances");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(x => x.UserId)
            .IsRequired();

        builder.Property(x => x.PolicyType)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(x => x.PolicyVersion)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(x => x.AcceptedAtUtc)
            .IsRequired();

        builder.Property(x => x.RecordedAtUtc)
            .IsRequired();

        builder.Property(x => x.IpAddress)
            .IsRequired()
            .HasMaxLength(64);

        builder.Property(x => x.UserAgent)
            .HasMaxLength(512);

        builder.HasIndex(x => new { x.UserId, x.PolicyType, x.PolicyVersion })
            .IsUnique();

        builder.HasIndex(x => x.UserId);

        builder.HasIndex(x => x.RecordedAtUtc);

        builder.HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
