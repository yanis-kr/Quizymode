using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CollectionItemConfiguration : IEntityTypeConfiguration<CollectionItem>
{
    public void Configure(EntityTypeBuilder<CollectionItem> builder)
    {
        builder.ToTable("CollectionItems");

        builder.HasKey(x => x.Id);

        builder.HasIndex(x => x.CollectionId);

        builder.HasIndex(x => x.ItemId);
    }
}
