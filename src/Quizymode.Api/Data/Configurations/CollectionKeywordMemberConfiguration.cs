using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class CollectionKeywordMemberConfiguration : IEntityTypeConfiguration<CollectionKeywordMember>
{
    public void Configure(EntityTypeBuilder<CollectionKeywordMember> builder)
    {
        builder.ToTable("CollectionKeywordMembers");

        builder.HasKey(x => x.Id);

        builder.HasIndex(x => new { x.ParentId, x.CategoryId, x.Keyword1Id, x.Keyword2Id })
            .IsUnique()
            .AreNullsDistinct(false);

        builder.HasOne<Collection>()
            .WithMany()
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
