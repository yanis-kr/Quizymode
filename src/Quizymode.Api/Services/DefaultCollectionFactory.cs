using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal static class DefaultCollectionFactory
{
    private const string FallbackCollectionName = "Default Collection";

    internal static Collection Create(string createdBy, string? displayName)
    {
        (string name, string? description) = BuildMetadata(displayName);

        return new Collection
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = false
        };
    }

    internal static (string Name, string? Description) BuildMetadata(string? displayName)
    {
        string? trimmedDisplayName = string.IsNullOrWhiteSpace(displayName)
            ? null
            : displayName.Trim();

        if (trimmedDisplayName is null)
        {
            return (FallbackCollectionName, null);
        }

        int prefixLength = Math.Min(3, trimmedDisplayName.Length);
        string prefix = trimmedDisplayName[..prefixLength];

        return ($"{prefix}'s Collection", $"{trimmedDisplayName} default collection");
    }
}
