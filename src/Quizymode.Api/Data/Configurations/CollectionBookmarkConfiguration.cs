using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

public sealed class CollectionBookmarkConfiguration : IEntityTypeConfiguration<CollectionBookmark>
{
    public void Configure(EntityTypeBuilder<CollectionBookmark> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.UserId, x.CollectionId })
            .IsUnique();

        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.CollectionId);
    }
}
