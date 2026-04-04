using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CollectionShareConfiguration : IEntityTypeConfiguration<CollectionShare>
{
    public void Configure(EntityTypeBuilder<CollectionShare> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasIndex(x => x.CollectionId);
        builder.HasIndex(x => x.SharedWithUserId);
        builder.HasIndex(x => x.SharedWithEmail);
    }
}
