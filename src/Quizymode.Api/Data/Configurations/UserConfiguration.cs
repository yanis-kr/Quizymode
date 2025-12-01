using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Users");

        builder.HasKey(u => u.Id);

        builder.Property(u => u.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(u => u.Subject)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(u => u.Email)
            .HasMaxLength(200);

        builder.Property(u => u.Name)
            .HasMaxLength(200);

        builder.Property(u => u.LastLogin)
            .IsRequired();

        builder.Property(u => u.CreatedAt)
            .IsRequired();

        builder.HasIndex(u => u.Subject).IsUnique();
        
        // Unique index on Email (allows multiple nulls, but non-null emails must be unique)
        builder.HasIndex(u => u.Email)
            .IsUnique()
            .HasFilter("\"Email\" IS NOT NULL");
        
        // Unique index on Name (allows multiple nulls, but non-null names must be unique)
        builder.HasIndex(u => u.Name)
            .IsUnique()
            .HasFilter("\"Name\" IS NOT NULL");
    }
}
