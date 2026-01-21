using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

internal sealed class UserUpsertMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<UserUpsertMiddleware> _logger;
    
    // Per-user semaphores to reduce database contention within this instance
    // This is an optimization layer - database locking still handles cross-instance synchronization
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _userSemaphores = new();
    
    // Limit concurrent database operations per user to reduce contention
    // Even with database locking, reducing concurrent requests helps performance
    private const int MaxConcurrentPerUser = 3;

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
                var auditService = context.RequestServices.GetRequiredService<IAuditService>();

                // Get or create a semaphore for this user to limit concurrent database operations
                // This reduces database contention within this instance, but database locking
                // still handles synchronization across multiple instances
                SemaphoreSlim userSemaphore = _userSemaphores.GetOrAdd(subject, _ => new SemaphoreSlim(MaxConcurrentPerUser, MaxConcurrentPerUser));
                
                // Wait for semaphore slot (with timeout to prevent indefinite blocking)
                bool acquired = await userSemaphore.WaitAsync(TimeSpan.FromSeconds(5), context.RequestAborted);
                if (!acquired)
                {
                    _logger.LogWarning("Timeout waiting for semaphore for user {Subject}", subject);
                    await _next(context);
                    return;
                }
                
                try
                {
                    // Use a transaction with serializable isolation level to prevent race conditions
                    // This ensures only one request can check and update LastLogin at a time
                    // Database-level locking handles synchronization across all instances
                    await using var transaction = await db.Database.BeginTransactionAsync(
                        System.Data.IsolationLevel.Serializable, 
                        context.RequestAborted);
                    try
                    {
                        // Lock the row for update to prevent concurrent modifications
                        // This ensures only one request can check and update LastLogin at a time
                        // FOR UPDATE will block other requests until this transaction commits
                        // This works across all API instances, not just this one
                        var lockedUser = await db.Users
                            .FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Subject\" = {subject} FOR UPDATE")
                            .AsTracking()
                            .FirstOrDefaultAsync(context.RequestAborted);
                    
                    Guid userId;
                    bool shouldLogLogin = false;
                    
                    if (lockedUser is null)
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
                        await db.SaveChangesAsync(context.RequestAborted);
                        userId = userEntity.Id;
                        _logger.LogInformation("Created new user record for subject: {Subject} with UserId: {UserId}", subject, userId);
                        
                        // Commit the transaction before logging audit
                        await transaction.CommitAsync(context.RequestAborted);
                        
                        // Log user creation audit
                        await auditService.LogAsync(
                            AuditAction.UserCreated,
                            userId: userId,
                            cancellationToken: context.RequestAborted);
                    }
                    else
                    {
                        // Successfully acquired lock - this request will handle the login audit decision
                        // For existing users:
                        // - Always update Email from claims (can change in Cognito)
                        // - Only update Name from claims if user hasn't set a custom name yet (Name is null or equals Subject)
                        // - Always update LastLogin to track user activity
                        // - Only log LoginSuccess if it's been more than 1 minute since last login (to avoid logging on token refresh)
                        
                        DateTime now = DateTime.UtcNow;
                        TimeSpan timeSinceLastLogin = now - lockedUser.LastLogin;
                        shouldLogLogin = timeSinceLastLogin.TotalMinutes > 1;
                        
                        // Update user fields
                        lockedUser.Email = email;
                        if (string.IsNullOrWhiteSpace(lockedUser.Name) || lockedUser.Name == lockedUser.Subject)
                        {
                            lockedUser.Name = name; // Update Name from claims only if user hasn't customized it
                        }
                        
                        // Always update LastLogin to track user activity
                        lockedUser.LastLogin = now;
                        await db.SaveChangesAsync(context.RequestAborted);
                        userId = lockedUser.Id;
                        
                        // Commit the transaction before logging audit (to release the lock)
                        await transaction.CommitAsync(context.RequestAborted);
                        
                        if (shouldLogLogin)
                        {
                            _logger.LogDebug("Updated user record for subject: {Subject} with UserId: {UserId} (new login after {Minutes:F1} minutes)", 
                                subject, userId, timeSinceLastLogin.TotalMinutes);
                            
                            // Log login success audit only for actual logins, not token refreshes
                            // This happens after the transaction commits to avoid holding the lock too long
                            await auditService.LogAsync(
                                AuditAction.LoginSuccess,
                                userId: userId,
                                cancellationToken: context.RequestAborted);
                        }
                        else
                        {
                            _logger.LogDebug("User {Subject} (UserId: {UserId}) authenticated but LastLogin was {Minutes:F1} minutes ago - skipping login audit (likely token refresh)", 
                                subject, userId, timeSinceLastLogin.TotalMinutes);
                        }
                    }
                    
                    // Store UserId in HttpContext.Items for UserContext to use
                    context.Items["UserId"] = userId.ToString();
                }
                catch
                {
                    await transaction.RollbackAsync(context.RequestAborted);
                    throw;
                }
            }
            finally
            {
                // Release the semaphore slot
                userSemaphore.Release();
            }
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
