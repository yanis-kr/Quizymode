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
            IsRepoManaged = false,
            Name = name,
            Description = description,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
            IsPublic = false,
            IsDiscoverable = false
        };
    }

    internal static (string Name, string? Description) BuildMetadata(string? displayName)
    {
        // A name stored before AC 4.1.10 may be an email address; it must not reach a collection others can see.
        string? trimmedDisplayName = string.IsNullOrWhiteSpace(displayName) || DisplayNameRules.LooksLikeEmail(displayName)
            ? null
            : displayName.Trim();

        if (trimmedDisplayName is null)
        {
            return (FallbackCollectionName, null);
        }

        int prefixLength = Math.Min(3, trimmedDisplayName.Length);
        if (char.IsHighSurrogate(trimmedDisplayName[prefixLength - 1]))
        {
            prefixLength--;
        }

        string prefix = trimmedDisplayName[..prefixLength];

        return ($"{prefix}'s Collection", $"{trimmedDisplayName} default collection");
    }
}
