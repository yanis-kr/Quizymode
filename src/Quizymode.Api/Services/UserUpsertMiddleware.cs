using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
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

    /// <summary>Length of the Users.Name column.</summary>
    internal const int MaxNameLength = 200;

    private const int NameSuffixLength = 6;
    private const int MaxNameAttempts = 5;
    private const int RetryAfterSeconds = 5;

    /// <summary>Marks a request whose identity was refused (not a temporary failure).</summary>
    private const string IdentityRefusedItem = "UserIdentityRefused";

    private static bool TryGetPostgresException(Exception? ex, out PostgresException? pg)
    {
        while (ex is not null)
        {
            if (ex is PostgresException found)
            {
                pg = found;
                return true;
            }

            ex = ex.InnerException;
        }

        pg = null;
        return false;
    }

    private static bool IsDuplicateUsersEmail(DbUpdateException ex)
    {
        if (!TryGetPostgresException(ex, out PostgresException? pg) || pg is null)
            return false;

        return pg.SqlState == PostgresErrorCodes.UniqueViolation
            && pg.ConstraintName == "IX_Users_Email";
    }

    private static bool IsDuplicateUsersName(DbUpdateException ex)
    {
        if (!TryGetPostgresException(ex, out PostgresException? pg) || pg is null)
            return false;

        return pg.SqlState == PostgresErrorCodes.UniqueViolation
            && pg.ConstraintName == "IX_Users_Name";
    }

    private static async Task TryRollbackCurrentTransactionAsync(
        ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        IDbContextTransaction? tx = db.Database.CurrentTransaction;
        if (tx is null)
            return;

        try
        {
            await tx.RollbackAsync(cancellationToken);
        }
        catch (ObjectDisposedException)
        {
            // Already rolled back / disposed (e.g. after duplicate-email retry path).
        }
    }

    internal enum EmailMatchDecision
    {
        /// <summary>The matched row already belongs to this subject; use it as-is.</summary>
        UseExisting,
        /// <summary>The matched row belongs to another subject and the email is verified; re-point it.</summary>
        Relink,
        /// <summary>The matched row belongs to another subject and the email is unverified; leave it untouched.</summary>
        Reject
    }

    /// <summary>
    /// True only when the token's email_verified claim is "true" (Cognito emits it as a boolean or string).
    /// </summary>
    internal static bool IsEmailVerified(ClaimsPrincipal user)
    {
        string? value = user.FindFirstValue("email_verified");
        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Decides what to do when a login with no matching Subject finds an existing row by email.
    /// Re-pointing a row to a different Subject requires a verified email, otherwise an unverified
    /// federated identity could take over another account.
    /// </summary>
    internal static EmailMatchDecision DecideEmailMatch(string subject, string existingSubject, bool emailVerified)
    {
        if (string.Equals(subject, existingSubject, StringComparison.Ordinal))
            return EmailMatchDecision.UseExisting;

        return emailVerified ? EmailMatchDecision.Relink : EmailMatchDecision.Reject;
    }

    public UserUpsertMiddleware(RequestDelegate next, ILogger<UserUpsertMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    /// <summary>The fields the cheap path needs to decide whether the locked upsert can be skipped.</summary>
    internal sealed record UserLoginSnapshot(Guid Id, string Subject, string? Email, string? Name, DateTime LastLogin);

    /// <summary>
    /// How stale LastLogin may get before the locked upsert refreshes it. Must stay below
    /// <see cref="LoginAuditDebounce"/> so a request that would write a LoginSuccess audit never skips.
    /// </summary>
    internal static readonly TimeSpan LastLoginRefreshInterval = TimeSpan.FromMinutes(5);

    /// <summary>Minimum time since the last recorded LastLogin before another LoginSuccess audit is written.</summary>
    internal static readonly TimeSpan LoginAuditDebounce = TimeSpan.FromMinutes(10);

    /// <summary>
    /// True when the locked upsert would write the same Email and Name and no audit, and LastLogin is
    /// less than <see cref="LastLoginRefreshInterval"/> old. A future LastLogin (clock skew) never skips.
    /// </summary>
    internal static bool CanSkipUpsert(UserLoginSnapshot snapshot, string? email, string name, DateTime nowUtc)
    {
        bool emailUnchanged = string.Equals(snapshot.Email, email, StringComparison.Ordinal);
        bool nameIsDefault = string.IsNullOrWhiteSpace(snapshot.Name) || snapshot.Name == snapshot.Subject;
        bool nameUnchanged = !nameIsDefault || string.Equals(snapshot.Name, name, StringComparison.Ordinal);
        TimeSpan age = nowUtc - snapshot.LastLogin;
        return emailUnchanged && nameUnchanged && age >= TimeSpan.Zero && age < LastLoginRefreshInterval;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User?.Identity?.IsAuthenticated ?? false)
        {
            try
            {
                await ResolveUserRetryingNameRaceAsync(context);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "User upsert failed: {Message}", ex.Message);
            }

            if (!context.Items.ContainsKey("UserId"))
            {
                await TryResolveExistingUserAsync(context);
            }

            // AC 4.1.8: no request runs as signed in without a user id.
            if (!context.Items.ContainsKey("UserId"))
            {
                if (context.RequestAborted.IsCancellationRequested)
                {
                    // The client has gone: not a server failure, and the handler must not run.
                    context.Response.StatusCode = StatusCodes.Status499ClientClosedRequest;
                    return;
                }

                if (RequiresSignedInUser(context))
                {
                    await RejectUnresolvedUserAsync(context);
                    return;
                }

                context.User = new ClaimsPrincipal(new ClaimsIdentity());
            }
        }

        // Single downstream call, outside every try, so a downstream exception can never re-run the pipeline.
        await _next(context);
    }

    /// <summary>
    /// Runs the upsert, once more if a concurrent request saved the same name after it was found free; the second
    /// attempt sees that row and adds a suffix (AC 4.1.9).
    /// </summary>
    private async Task ResolveUserRetryingNameRaceAsync(HttpContext context)
    {
        try
        {
            await ResolveUserAsync(context);
        }
        catch (DbUpdateException ex) when (IsDuplicateUsersName(ex))
        {
            context.RequestServices.GetRequiredService<ApplicationDbContext>().ChangeTracker.Clear();
            await ResolveUserAsync(context);
        }
    }

    /// <summary>
    /// If the user already exists, sets UserId so a failed or skipped upsert does not sign the caller out
    /// (e.g. GET users/settings still works).
    /// </summary>
    private async Task TryResolveExistingUserAsync(HttpContext context)
    {
        string? subject = context.User.FindFirstValue("sub") ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(subject) || context.Items.ContainsKey(IdentityRefusedItem))
        {
            return;
        }

        try
        {
            ApplicationDbContext db = context.RequestServices.GetRequiredService<ApplicationDbContext>();
            Guid existingUser = await db.Users
                .AsNoTracking()
                .Where(u => u.Subject == subject)
                .Select(u => u.Id)
                .FirstOrDefaultAsync(context.RequestAborted);
            if (existingUser != default)
            {
                context.Items["UserId"] = existingUser.ToString();
                _logger.LogDebug("Set UserId from fallback lookup for subject {Subject}", subject);
            }
        }
        catch (Exception fallbackEx)
        {
            _logger.LogWarning(fallbackEx, "Fallback user lookup failed for subject {Subject}", subject);
        }
    }

    private static bool RequiresSignedInUser(HttpContext context)
    {
        Endpoint? endpoint = context.GetEndpoint();
        return endpoint?.Metadata.GetMetadata<IAuthorizeData>() is not null
            && endpoint.Metadata.GetMetadata<IAllowAnonymous>() is null;
    }

    /// <summary>403 when the identity was refused; 503 with Retry-After when resolution may succeed later.</summary>
    private static Task RejectUnresolvedUserAsync(HttpContext context)
    {
        if (context.Items.ContainsKey(IdentityRefusedItem))
        {
            return CustomResults
                .Forbidden("This sign-in could not be linked to an account. Verify your email address, then sign in again.")
                .ExecuteAsync(context);
        }

        context.Response.Headers.RetryAfter = RetryAfterSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Results.Problem(
                title: "Service Unavailable",
                detail: "Your account could not be loaded. Please try again in a moment.",
                type: "https://tools.ietf.org/html/rfc7231#section-6.6.4",
                statusCode: StatusCodes.Status503ServiceUnavailable)
            .ExecuteAsync(context);
    }

    /// <summary>
    /// A display name that fits the column and is not another user's (ignoring case): the claim itself, or the claim
    /// with a short random suffix. Names are unique, so an unchanged duplicate would stop the user row being saved.
    /// </summary>
    private static async Task<string> ResolveAvailableNameAsync(
        ApplicationDbContext db,
        string name,
        Guid userId,
        CancellationToken cancellationToken)
    {
        string candidate = Truncate(name, MaxNameLength);
        for (int attempt = 0; attempt < MaxNameAttempts; attempt++)
        {
            string lowered = candidate.ToLowerInvariant();
            bool taken = await db.Users.AnyAsync(
                // The exact match matters: .NET and the database lower-case some letters differently (U+0130).
                u => u.Id != userId && u.Name != null && (u.Name == candidate || u.Name.ToLower() == lowered),
                cancellationToken);
            if (!taken)
            {
                return candidate;
            }

            string suffix = Guid.NewGuid().ToString("N")[..NameSuffixLength];
            candidate = $"{Truncate(name, MaxNameLength - NameSuffixLength - 1)}-{suffix}";
        }

        return Guid.NewGuid().ToString("N");
    }

    /// <summary>Cuts to at most <paramref name="maxLength"/> characters without splitting a surrogate pair.</summary>
    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        int length = char.IsHighSurrogate(value[maxLength - 1]) ? maxLength - 1 : maxLength;
        return value[..length];
    }

    /// <summary>Resolves the signed-in user and publishes HttpContext.Items["UserId"]. Never invokes the next delegate.</summary>
    private async Task ResolveUserAsync(HttpContext context)
    {
        ClaimsPrincipal user = context.User;
        // Cognito uses "sub" claim for subject
        // Also check ClaimTypes.NameIdentifier as fallback
        string? subject = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
        
        if (string.IsNullOrWhiteSpace(subject))
        {
            // Claim types only: claim values can hold email and name (#476).
            _logger.LogWarning("User is authenticated but no subject claim found. Available claim types: {ClaimTypes}",
                string.Join(", ", user.Claims.Select(c => c.Type).Distinct()));
            context.Items[IdentityRefusedItem] = true;
            return;
        }

        // Cognito claim names: "email", "name", "cognito:username", "preferred_username"
        // Also check standard ClaimTypes for compatibility
        string? email = user.FindFirstValue("email") 
            ?? user.FindFirstValue(ClaimTypes.Email);
        
        // In Cognito, the User Name IS the Subject (GUID)
        // Use Subject as Name if no name claim is found
        string? displayName = user.FindFirstValue("name") 
            ?? user.FindFirstValue("cognito:username")
            ?? user.FindFirstValue("preferred_username")
            ?? user.FindFirstValue(ClaimTypes.Name);
        
        string name = displayName ?? subject; // Fallback to Subject if no name claim

        // Subject only: email and name are personal data and stay out of logs (#476).
        _logger.LogDebug("Processing user upsert for subject: {Subject}", subject);

        // Resolve db and upsert
        var db = context.RequestServices.GetRequiredService<ApplicationDbContext>();
        var auditService = context.RequestServices.GetRequiredService<IAuditService>();

        // Cheap path (#328): an unlocked read with no transaction. When the locked upsert would write nothing
        // new (same email, same name outcome, LastLogin still fresh) skip the transaction and row lock.
        UserLoginSnapshot? snapshot = await db.Users
            .AsNoTracking()
            .Where(u => u.Subject == subject)
            .Select(u => new UserLoginSnapshot(u.Id, u.Subject, u.Email, u.Name, u.LastLogin))
            .FirstOrDefaultAsync(context.RequestAborted);
        if (snapshot is not null && CanSkipUpsert(snapshot, email, name, DateTime.UtcNow))
        {
            context.Items["UserId"] = snapshot.Id.ToString();
            _logger.LogDebug("Skipped user upsert for subject {Subject} (UserId: {UserId}): row unchanged and LastLogin is recent",
                subject, snapshot.Id);
            return;
        }

        // Get or create a semaphore for this user to limit concurrent database operations
        // This reduces database contention within this instance, but database locking
        // still handles synchronization across multiple instances
        SemaphoreSlim userSemaphore = _userSemaphores.GetOrAdd(subject, _ => new SemaphoreSlim(MaxConcurrentPerUser, MaxConcurrentPerUser));
        
        // Wait for semaphore slot (with timeout to prevent indefinite blocking)
        bool acquired = await userSemaphore.WaitAsync(TimeSpan.FromSeconds(5), context.RequestAborted);
        if (!acquired)
        {
            _logger.LogWarning("Timeout waiting for semaphore for user {Subject}", subject);
            return;
        }
        
        try
        {
            // Use ReadCommitted with FOR UPDATE - row lock prevents concurrent updates.
            // Serializable was causing 40001 when multiple requests (e.g. page load) ran in parallel.
            await using var transaction = await db.Database.BeginTransactionAsync(
                System.Data.IsolationLevel.ReadCommitted, 
                context.RequestAborted);
            try
            {
                // Lock the row for update - other requests block until this commits
                var lockedUser = await db.Users
                    .FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Subject\" = {subject} FOR UPDATE")
                    .Where(u => u.Subject == subject)
                    .AsTracking()
                    .FirstOrDefaultAsync(context.RequestAborted);

                // Serialize concurrent first-time sign-ins for the same email (PostgreSQL only).
                // Without this, parallel requests can both pass the email-exists check and hit IX_Users_Email.
                if (lockedUser is null
                    && !string.IsNullOrWhiteSpace(email)
                    && db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true)
                {
                    string emailLockKey = email.Trim().ToLowerInvariant();
                    await db.Database.ExecuteSqlInterpolatedAsync(
                        $"SELECT pg_advisory_xact_lock(hashtext({emailLockKey}), 810572531)",
                        context.RequestAborted);
                }
            
            Guid userId = Guid.Empty;
            bool userResolved = true;
            bool shouldLogLogin = false;
            bool emailVerified = IsEmailVerified(user);
            
            if (lockedUser is null)
            {
                // No user with this Subject - may be first login or Subject changed (e.g. Cognito user re-created).
                // If a user with this Email already exists, link this login to them (update Subject) to avoid IX_Users_Email violation.
                User? existingByEmail = null;
                if (!string.IsNullOrWhiteSpace(email))
                {
                    string emailNorm = email.Trim().ToLowerInvariant();
                    existingByEmail = await db.Users
                        .Where(u => u.Email != null && u.Email.Trim().ToLower() == emailNorm)
                        .AsTracking()
                        .FirstOrDefaultAsync(context.RequestAborted);
                    if (existingByEmail is not null)
                    {
                        // Lock the row so we can update it (SELECT FOR UPDATE by primary key)
                        await db.Users
                            .FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Id\" = {existingByEmail.Id} FOR UPDATE")
                            .Where(u => u.Id == existingByEmail.Id)
                            .AsTracking()
                            .FirstOrDefaultAsync(context.RequestAborted);
                        existingByEmail = await db.Users.FindAsync(new object[] { existingByEmail.Id }, context.RequestAborted);
                    }
                }

                if (existingByEmail is not null)
                {
                    EmailMatchDecision decision = DecideEmailMatch(subject, existingByEmail.Subject, emailVerified);
                    if (decision == EmailMatchDecision.Reject)
                    {
                        // Unverified email must not take over another identity's row, and a second row would
                        // violate IX_Users_Email. Leave everything unchanged and continue without a user id.
                        _logger.LogWarning(
                            "Not linking subject {Subject} to an existing user by email: email_verified is not true",
                            subject);
                        userResolved = false;
                        await transaction.RollbackAsync(context.RequestAborted);
                    }
                    else
                    {
                        // Link this identity (Subject) to the existing user - update Subject and LastLogin
                        existingByEmail.Subject = subject;
                        existingByEmail.Email = email;
                        if (string.IsNullOrWhiteSpace(existingByEmail.Name) || existingByEmail.Name == existingByEmail.Subject)
                            existingByEmail.Name = await ResolveAvailableNameAsync(db, name, existingByEmail.Id, context.RequestAborted);
                        existingByEmail.LastLogin = DateTime.UtcNow;
                        await db.SaveChangesAsync(context.RequestAborted);
                        userId = existingByEmail.Id;
                        _logger.LogInformation("Linked existing user (UserId: {UserId}) to new Subject: {Subject}", userId, subject);
                        await transaction.CommitAsync(context.RequestAborted);
                    }
                }
                else
                {
                    // Truly new user: create user, default collection, and set it as active
                    Guid newUserId = Guid.NewGuid();
                    var userEntity = new User
                    {
                        Id = newUserId,
                        Subject = subject,
                        Email = email,
                        Name = await ResolveAvailableNameAsync(db, name, newUserId, context.RequestAborted),
                        CreatedAt = DateTime.UtcNow,
                        LastLogin = DateTime.UtcNow
                    };

                    db.Users.Add(userEntity);

                    Collection defaultCollection = DefaultCollectionFactory.Create(
                        userEntity.Id.ToString(),
                        displayName is null ? null : Truncate(displayName, MaxNameLength));
                    db.Collections.Add(defaultCollection);

                    var activeCollectionSetting = new UserSetting
                    {
                        Id = Guid.NewGuid(),
                        UserId = userEntity.Id,
                        Key = "ActiveCollectionId",
                        Value = defaultCollection.Id.ToString(),
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    db.UserSettings.Add(activeCollectionSetting);

                    try
                    {
                        await db.SaveChangesAsync(context.RequestAborted);
                    }
                    catch (DbUpdateException ex) when (IsDuplicateUsersEmail(ex))
                    {
                        // Race: another request inserted same email - load and use that user, update Subject
                        await transaction.RollbackAsync(context.RequestAborted);
                        db.ChangeTracker.Clear();
                        await using var retryTransaction = await db.Database.BeginTransactionAsync(
                            System.Data.IsolationLevel.ReadCommitted,
                            context.RequestAborted);
                        string emailNorm = email!.Trim().ToLowerInvariant();
                        User? byEmail = await db.Users
                            .Where(u => u.Email != null && u.Email.Trim().ToLower() == emailNorm)
                            .AsTracking()
                            .FirstOrDefaultAsync(context.RequestAborted);
                        if (byEmail is not null
                            && DecideEmailMatch(subject, byEmail.Subject, emailVerified) == EmailMatchDecision.Reject)
                        {
                            _logger.LogWarning(
                                "Not linking subject {Subject} to an existing user after duplicate key: email_verified is not true",
                                subject);
                            userResolved = false;
                            await retryTransaction.RollbackAsync(context.RequestAborted);
                        }
                        else if (byEmail is not null)
                        {
                            byEmail.Subject = subject;
                            byEmail.LastLogin = DateTime.UtcNow;
                            await db.SaveChangesAsync(context.RequestAborted);
                            await retryTransaction.CommitAsync(context.RequestAborted);
                            userId = byEmail.Id;
                            _logger.LogInformation(
                                "Duplicate key on insert - linked existing user (UserId: {UserId}) to Subject: {Subject}",
                                userId,
                                subject);
                        }
                        else
                        {
                            _logger.LogWarning(
                                "IX_Users_Email violation but no row matched email after rollback (subject {Subject})",
                                subject);
                            throw;
                        }

                        goto afterUpsert;
                    }
                    userId = userEntity.Id;
                    _logger.LogInformation("Created new user record for subject: {Subject} with UserId: {UserId}", subject, userId);
                    await transaction.CommitAsync(context.RequestAborted);
                    await auditService.LogAsync(
                        AuditAction.UserCreated,
                        userId: userId,
                        cancellationToken: context.RequestAborted);
                }
            afterUpsert:;
            }
            else
            {
                // Successfully acquired lock - this request will handle the login audit decision
                // For existing users:
                // - Always update Email from claims (can change in Cognito)
                // - Only update Name from claims if user hasn't set a custom name yet (Name is null or equals Subject)
                // - Always update LastLogin to track user activity
                // - Only log LoginSuccess if it's been more than 10 minutes since last login (debounce token refreshes)

                DateTime now = DateTime.UtcNow;
                TimeSpan timeSinceLastLogin = now - lockedUser.LastLogin;
                shouldLogLogin = timeSinceLastLogin > LoginAuditDebounce;
                
                // Update user fields
                lockedUser.Email = email;
                if (string.IsNullOrWhiteSpace(lockedUser.Name) || lockedUser.Name == lockedUser.Subject)
                {
                    // Update Name from claims only if user hasn't customized it
                    lockedUser.Name = await ResolveAvailableNameAsync(db, name, lockedUser.Id, context.RequestAborted);
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
                    _logger.LogDebug("User {Subject} (UserId: {UserId}) authenticated but LastLogin was {Minutes:F1} minutes ago - skipping login audit (token refresh within 10-minute window)",
                        subject, userId, timeSinceLastLogin.TotalMinutes);
                }
            }
            
            // Store UserId in HttpContext.Items for UserContext to use
            if (userResolved)
            {
                context.Items["UserId"] = userId.ToString();
            }
            else
            {
                context.Items[IdentityRefusedItem] = true;
            }
        }
        catch
        {
            await TryRollbackCurrentTransactionAsync(db, context.RequestAborted);
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
