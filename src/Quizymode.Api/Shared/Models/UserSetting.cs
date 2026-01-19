namespace Quizymode.Api.Shared.Models;

/// <summary>
/// Represents a user-specific application setting stored in the database.
/// Settings are key-value pairs that persist across sessions and can be modified by the user.
/// </summary>
public sealed class UserSetting
{
    public Guid Id { get; set; }

    /// <summary>
    /// Foreign key to the User entity. Links this setting to a specific user account.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Navigation property to the User entity.
    /// </summary>
    public User User { get; set; } = null!;

    /// <summary>
    /// The setting key (e.g., "PageSize", "Theme", "Language").
    /// Must be unique per user.
    /// </summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>
    /// The setting value stored as a string. Can be parsed to the appropriate type based on the Key.
    /// </summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// When this setting was created.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When this setting was last updated.
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
