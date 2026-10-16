using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data.Configurations;

internal sealed class ClientErrorConfiguration : IEntityTypeConfiguration<ClientError>
{
    public void Configure(EntityTypeBuilder<ClientError> builder)
    {
        builder.ToTable("ClientErrors");

        builder.HasKey(clientError => clientError.Id);

        builder.Property(clientError => clientError.Id)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(clientError => clientError.Fingerprint)
            .IsRequired()
            .HasMaxLength(32);

        builder.Property(clientError => clientError.Source)
            .IsRequired()
            .HasMaxLength(16);

        builder.Property(clientError => clientError.ErrorName)
            .IsRequired()
            .HasMaxLength(ClientError.MaxErrorNameLength);

        builder.Property(clientError => clientError.Message)
            .IsRequired()
            .HasMaxLength(ClientError.MaxMessageLength);

        builder.Property(clientError => clientError.Stack)
            .HasMaxLength(ClientError.MaxStackLength);

        builder.Property(clientError => clientError.ComponentStack)
            .HasMaxLength(ClientError.MaxComponentStackLength);

        builder.Property(clientError => clientError.Path)
            .IsRequired()
            .HasMaxLength(ClientError.MaxPathLength);

        builder.Property(clientError => clientError.AppVersion)
            .HasMaxLength(32);

        builder.Property(clientError => clientError.SessionId)
            .IsRequired()
            .HasMaxLength(128);

        builder.Property(clientError => clientError.VisitorId)
            .HasMaxLength(128);

        builder.Property(clientError => clientError.IsAuthenticated)
            .IsRequired();

        builder.Property(clientError => clientError.UserAgent)
            .HasMaxLength(512);

        builder.Property(clientError => clientError.DeviceClass)
            .IsRequired()
            .HasMaxLength(16);

        builder.Property(clientError => clientError.IsBot)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(clientError => clientError.IsInternal)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(clientError => clientError.OccurredUtc)
            .IsRequired();

        builder.HasIndex(clientError => clientError.OccurredUtc);
        builder.HasIndex(clientError => new { clientError.Fingerprint, clientError.OccurredUtc });
        builder.HasIndex(clientError => new { clientError.SessionId, clientError.Fingerprint });
        builder.HasIndex(clientError => clientError.AppVersion);
    }
}
