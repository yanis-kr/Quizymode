using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class UserItemProgressConfiguration : IEntityTypeConfiguration<UserItemProgress>
{
    public void Configure(EntityTypeBuilder<UserItemProgress> builder)
    {
        builder.ToTable("UserItemProgress");
        builder.HasKey(x => new { x.UserId, x.ItemId });
        builder.Property(x => x.UserId).IsRequired().HasMaxLength(100);
        builder.Property(x => x.IsKnown).IsRequired();
        builder.Property(x => x.UpdatedAt).IsRequired();
    }
}
