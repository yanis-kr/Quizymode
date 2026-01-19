using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

/// <summary>
/// Entity Framework configuration for the UserSetting entity.
/// Defines table structure, indexes, and constraints for user settings storage.
/// </summary>
internal sealed class UserSettingConfiguration : IEntityTypeConfiguration<UserSetting>
{
    public void Configure(EntityTypeBuilder<UserSetting> builder)
    {
        builder.ToTable("UserSettings");

        builder.HasKey(us => us.Id);

        builder.Property(us => us.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(us => us.UserId)
            .IsRequired();

        builder.Property(us => us.Key)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(us => us.Value)
            .IsRequired()
            .HasMaxLength(500);

        builder.Property(us => us.CreatedAt)
            .IsRequired();

        builder.Property(us => us.UpdatedAt)
            .IsRequired();

        // Unique constraint: each user can only have one setting per key
        builder.HasIndex(us => new { us.UserId, us.Key })
            .IsUnique();

        // Foreign key relationship to User
        builder.HasOne(us => us.User)
            .WithMany()
            .HasForeignKey(us => us.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Index for efficient lookups by UserId
        builder.HasIndex(us => us.UserId);
    }
}
