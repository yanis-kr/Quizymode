using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CollectionCollectionMemberConfiguration : IEntityTypeConfiguration<CollectionCollectionMember>
{
    public void Configure(EntityTypeBuilder<CollectionCollectionMember> builder)
    {
        builder.ToTable("CollectionCollectionMembers", t => t.HasCheckConstraint("CK_CollectionCollectionMembers_NoSelf", "\"ParentId\" <> \"ChildId\""));

        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.ParentId, x.ChildId }).IsUnique();

        builder.HasIndex(x => x.ChildId);

        builder.HasOne<Collection>()
            .WithMany()
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Collection>()
            .WithMany()
            .HasForeignKey(x => x.ChildId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
