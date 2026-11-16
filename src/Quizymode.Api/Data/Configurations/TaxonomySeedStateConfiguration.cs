using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class TaxonomySeedStateConfiguration : IEntityTypeConfiguration<TaxonomySeedState>
{
    public void Configure(EntityTypeBuilder<TaxonomySeedState> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Sha256).IsRequired().HasMaxLength(64);
    }
}
