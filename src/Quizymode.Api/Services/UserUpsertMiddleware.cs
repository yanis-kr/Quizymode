using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal sealed class UserUpsertMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<UserUpsertMiddleware> _logger;

    public UserUpsertMiddleware(RequestDelegate next, ILogger<UserUpsertMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            ClaimsPrincipal? user = context.User;
            if (user?.Identity?.IsAuthenticated ?? false)
            {
                // Cognito uses "sub" claim for subject
                // Also check ClaimTypes.NameIdentifier as fallback
                string? subject = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
                
                if (string.IsNullOrWhiteSpace(subject))
                {
                    _logger.LogWarning("User is authenticated but no subject claim found. Available claims: {Claims}",
                        string.Join(", ", user.Claims.Select(c => $"{c.Type}={c.Value}")));
                    await _next(context);
                    return;
                }

                // Cognito claim names: "email", "name", "cognito:username", "preferred_username"
                // Also check standard ClaimTypes for compatibility
                string? email = user.FindFirstValue("email") 
                    ?? user.FindFirstValue(ClaimTypes.Email);
                
                // In Cognito, the User Name IS the Subject (GUID)
                // Use Subject as Name if no name claim is found
                string? name = user.FindFirstValue("name") 
                    ?? user.FindFirstValue("cognito:username")
                    ?? user.FindFirstValue("preferred_username")
                    ?? user.FindFirstValue(ClaimTypes.Name)
                    ?? subject; // Fallback to Subject if no name claim

                _logger.LogDebug("Processing user upsert for subject: {Subject}, email: {Email}, name: {Name}",
                    subject, email ?? "null", name ?? "null");

                // Resolve db and upsert
                var db = context.RequestServices.GetRequiredService<ApplicationDbContext>();

                var existing = await db.Users.FirstOrDefaultAsync(u => u.Subject == subject);
                Guid userId;
                
                if (existing is null)
                {
                    // For new users, set Name from claims if available, otherwise use subject as fallback
                    var userEntity = new User
                    {
                        Id = Guid.NewGuid(),
                        Subject = subject,
                        Email = email,
                        Name = name, // Use name from claims (or subject as fallback)
                        CreatedAt = DateTime.UtcNow,
                        LastLogin = DateTime.UtcNow
                    };

                    db.Users.Add(userEntity);
                    await db.SaveChangesAsync();
                    userId = userEntity.Id;
                    _logger.LogInformation("Created new user record for subject: {Subject} with UserId: {UserId}", subject, userId);
                }
                else
                {
                    // For existing users:
                    // - Always update Email from claims (can change in Cognito)
                    // - Only update Name from claims if user hasn't set a custom name yet (Name is null or equals Subject)
                    // - Always update LastLogin
                    existing.Email = email;
                    if (string.IsNullOrWhiteSpace(existing.Name) || existing.Name == existing.Subject)
                    {
                        existing.Name = name; // Update Name from claims only if user hasn't customized it
                    }
                    existing.LastLogin = DateTime.UtcNow;
                    await db.SaveChangesAsync();
                    userId = existing.Id;
                    _logger.LogDebug("Updated user record for subject: {Subject} with UserId: {UserId}", subject, userId);
                }
                
                // Store UserId in HttpContext.Items for UserContext to use
                context.Items["UserId"] = userId.ToString();
            }
        }
        catch (Exception ex)
        {
            // Log the error but don't fail the request
            _logger.LogError(ex, "User upsert failed: {Message}", ex.Message);
        }

        await _next(context);
    }
}
