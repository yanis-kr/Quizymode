using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal sealed class UserUpsertMiddleware
{
    private readonly RequestDelegate _next;

    public UserUpsertMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            ClaimsPrincipal? user = context.User;
            if (user?.Identity?.IsAuthenticated ?? false)
            {
                string? subject = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!string.IsNullOrWhiteSpace(subject))
                {
                    // Retrieve basic claims
                    string? email = user.FindFirstValue(ClaimTypes.Email);
                    string? name = user.FindFirstValue(ClaimTypes.Name);

                    // Resolve db and upsert
                    var db = context.RequestServices.GetRequiredService<ApplicationDbContext>();

                    var existing = await db.Users.FirstOrDefaultAsync(u => u.Subject == subject);
                    if (existing is null)
                    {
                        var userEntity = new User
                        {
                            Id = Guid.NewGuid(),
                            Subject = subject,
                            Email = email,
                            Name = name,
                            CreatedAt = DateTime.UtcNow,
                            LastLogin = DateTime.UtcNow
                        };

                        db.Users.Add(userEntity);
                    }
                    else
                    {
                        existing.Email = email;
                        existing.Name = name;
                        existing.LastLogin = DateTime.UtcNow;
                    }

                    await db.SaveChangesAsync();
                }
            }
        }
        catch
        {
            // Do not fail requests if upsert fails - log if logger available
            try
            {
                var logger = context.RequestServices.GetService<ILogger<UserUpsertMiddleware>>();
                logger?.LogWarning("User upsert failed");
            }
            catch { }
        }

        await _next(context);
    }
}
