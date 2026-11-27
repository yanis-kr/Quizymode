using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Items.Export;
using Quizymode.Api.Features.Items.Get;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Services;

/// <summary>
/// #233: runs the real <see cref="UserUpsertMiddleware"/> through the JWT bearer pipeline against a real
/// PostgreSQL container, covering the email_verified relink/reject branches and the IX_Users_Email
/// duplicate-key race that SQLite cannot execute. Requires Docker (see tests README).
/// </summary>
[Trait("Category", "Postgres")]
public sealed class UserUpsertMiddlewarePostgresTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private static readonly DateTime PastUtc = DateTime.SpecifyKind(new DateTime(2024, 1, 1, 12, 0, 0), DateTimeKind.Utc);

    private sealed record WhoAmI(bool IsAuthenticated, string? UserId);

    private sealed record CapturedLog(LogLevel Level, string Category, string Message);

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly List<CapturedLog> _entries = [];

        public IReadOnlyList<CapturedLog> Entries
        {
            get
            {
                lock (_entries)
                {
                    return _entries.ToList();
                }
            }
        }

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, this);

        public void Dispose()
        {
        }

        private void Add(CapturedLog entry)
        {
            lock (_entries)
            {
                _entries.Add(entry);
            }
        }

        private sealed class CapturingLogger(string category, CapturingLoggerProvider owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
                => owner.Add(new CapturedLog(logLevel, category, formatter(state, exception)));
        }
    }

    /// <summary>
    /// Fires once, before the first INSERT of a new User, and commits a competing row for the same email on its
    /// own connection (auto-commit), reproducing a concurrent first sign-in that wins the race.
    /// </summary>
    private sealed class DuplicateEmailRaceInterceptor(string connectionString, string email, string winnerSubject, Guid winnerId)
        : SaveChangesInterceptor
    {
        private int _fired;

        public bool Fired => Volatile.Read(ref _fired) == 1;

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            bool addingUser = eventData.Context!.ChangeTracker.Entries<User>().Any(e => e.State == EntityState.Added);
            if (addingUser && Interlocked.Exchange(ref _fired, 1) == 0)
            {
                await using NpgsqlConnection connection = new(connectionString);
                await connection.OpenAsync(cancellationToken);
                await using NpgsqlCommand command = new(
                    """
                    INSERT INTO "Users" ("Id","Subject","Email","Name","LastLogin","CreatedAt","IsInternal")
                    VALUES (@id,@subject,@email,@name,@ts,@ts,false)
                    """,
                    connection);
                command.Parameters.AddWithValue("id", winnerId);
                command.Parameters.AddWithValue("subject", winnerSubject);
                command.Parameters.AddWithValue("email", email);
                command.Parameters.AddWithValue("name", $"winner-{winnerId}");
                command.Parameters.AddWithValue("ts", PastUtc);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            return result;
        }
    }

    private sealed class Scenario : IAsyncDisposable
    {
        public required JwtHttpTestHost Host { get; init; }

        public required CapturingLoggerProvider Logs { get; init; }

        public ValueTask DisposeAsync() => Host.DisposeAsync();

        public IEnumerable<CapturedLog> UpsertLogs => Logs.Entries.Where(e => e.Category.Contains(nameof(UserUpsertMiddleware)));
    }

    private void RequireDatabase() => Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);

    private async Task<Scenario> StartAsync(params IInterceptor[] interceptors)
    {
        RequireDatabase();

        CapturingLoggerProvider logs = new();
        JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            () => fixture.CreateDbContext(interceptors),
            services => services.AddSingleton<ILoggerProvider>(logs),
            app =>
            {
                static IResult WhoAmIResult(IUserContext userContext) =>
                    Results.Ok(new { isAuthenticated = userContext.IsAuthenticated, userId = userContext.UserId });
                app.MapGet("/test/whoami", WhoAmIResult).RequireAuthorization();
                app.MapGet("/test/public", WhoAmIResult);
                app.MapGet("/test/anonymous", WhoAmIResult).RequireAuthorization().AllowAnonymous();
                app.MapGet("/test/admin", () => Results.Ok()).RequireAuthorization("Admin");
                app.MapGet("/test/is-admin", (IUserContext userContext) => Results.Ok(userContext.IsAdmin));
                new GetItems.Endpoint().MapEndpoint(app);
                new ExportItems.Endpoint().MapEndpoint(app);
            },
            useUserUpsertMiddleware: true);
        return new Scenario { Host = host, Logs = logs };
    }

    private static async Task<WhoAmI> WhoAmIAsync(Scenario scenario, string subject, string email, object? emailVerified, string? name = null)
    {
        string token = scenario.Host.CreateToken(subject, email, emailVerified: emailVerified, name: name);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/test/whoami", token);
        using HttpResponseMessage response = await scenario.Host.Client.SendAsync(request);
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        WhoAmI? body = await response.Content.ReadFromJsonAsync<WhoAmI>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
        body.Should().NotBeNull();
        body!.IsAuthenticated.Should().BeTrue();
        return body;
    }

    private static async Task<HttpResponseMessage> GetAsync(
        Scenario scenario, string path, string subject, string email, object? emailVerified, string? name = null)
    {
        string token = scenario.Host.CreateToken(subject, email, emailVerified: emailVerified, name: name);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, path, token);
        return await scenario.Host.Client.SendAsync(request);
    }

    private static async Task AssertRefusedAsync(Scenario scenario, string subject, string email, object? emailVerified)
    {
        using HttpResponseMessage response = await GetAsync(scenario, "/test/whoami", subject, email, emailVerified);
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    private static void AssertNoUpsertFailure(Scenario scenario) =>
        scenario.Logs.Entries.Where(e => e.Message.Contains("User upsert failed"))
            .Should().BeEmpty("the middleware swallows exceptions, so a logged failure would make assertions pass vacuously");

    private async Task<User> SeedUserAsync(string subject, string email)
    {
        RequireDatabase();
        User user = new()
        {
            Id = Guid.NewGuid(),
            Subject = subject,
            Email = email,
            Name = $"seed-{Guid.NewGuid()}",
            LastLogin = PastUtc,
            CreatedAt = PastUtc
        };
        await using ApplicationDbContext db = fixture.CreateDbContext();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<List<User>> UsersByEmailAsync(string email)
    {
        string norm = email.ToLowerInvariant();
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return await db.Users.AsNoTracking().Where(u => u.Email != null && u.Email.ToLower() == norm).ToListAsync();
    }

    private async Task<User?> UserByIdAsync(Guid id)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id);
    }

    private async Task<(int Collections, int Settings)> CountsAsync()
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return (await db.Collections.CountAsync(), await db.UserSettings.CountAsync());
    }

    private static string NewSubject() => Guid.NewGuid().ToString();

    private async Task<int> CountUserCreatedAuditsAsync()
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return await db.Audits.CountAsync(a => a.Action == AuditAction.UserCreated);
    }

    private static string NewEmail() => $"{Guid.NewGuid():N}@example.com";

    [SkippableTheory]
    [InlineData(false)]
    [InlineData("false")]
    [InlineData(null)]
    public async Task DifferentSubject_EmailUnverified_Rejects(object? emailVerified)
    {
        string seededEmail = "Alice.X." + NewEmail();
        string requestEmail = seededEmail.ToLowerInvariant();
        string subjectA = NewSubject();
        string subjectB = NewSubject();
        User seeded = await SeedUserAsync(subjectA, seededEmail);
        int userCreatedBefore = await CountUserCreatedAuditsAsync();
        await using Scenario scenario = await StartAsync();

        await AssertRefusedAsync(scenario, subjectB, requestEmail, emailVerified);

        User? after = await UserByIdAsync(seeded.Id);
        after.Should().NotBeNull();
        after!.Subject.Should().Be(subjectA);
        after.Email.Should().Be(seededEmail);
        after.LastLogin.Should().Be(seeded.LastLogin);
        (await UsersByEmailAsync(requestEmail)).Should().ContainSingle();
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            (await db.Users.AnyAsync(u => u.Subject == subjectB)).Should().BeFalse();
        }
        (await CountUserCreatedAuditsAsync()).Should().Be(userCreatedBefore, "a rejected match must not create a user");

        AssertNoUpsertFailure(scenario);
        CapturedLog warning = scenario.UpsertLogs.Should().ContainSingle(e => e.Level == LogLevel.Warning).Subject;
        warning.Message.Should().Contain("Not linking subject").And.Contain("email_verified is not true");
        warning.Message.Should().Contain(subjectB).And.NotContainEquivalentOf(requestEmail);
    }

    [SkippableTheory]
    [InlineData(true)]
    [InlineData("true")]
    [InlineData("True")]
    public async Task DifferentSubject_EmailVerified_Relinks(object emailVerified)
    {
        string seededEmail = "Alice.X." + NewEmail();
        string requestEmail = seededEmail.ToLowerInvariant();
        string subjectB = NewSubject();
        User seeded = await SeedUserAsync(NewSubject(), seededEmail);
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subjectB, requestEmail, emailVerified);

        who.UserId.Should().Be(seeded.Id.ToString());
        User row = (await UsersByEmailAsync(requestEmail)).Should().ContainSingle().Subject;
        row.Id.Should().Be(seeded.Id);
        row.Subject.Should().Be(subjectB);
        row.Email.Should().Be(requestEmail);
        row.LastLogin.Should().BeAfter(seeded.LastLogin);
        AssertNoUpsertFailure(scenario);
        scenario.UpsertLogs.Should().Contain(e => e.Level == LogLevel.Information && e.Message.Contains("Linked existing user"));
    }

    [SkippableFact]
    public async Task SameSubject_ReusesRow_RegardlessOfVerification()
    {
        string email = NewEmail();
        string subject = NewSubject();
        User seeded = await SeedUserAsync(subject, email);
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subject, email, emailVerified: false);

        who.UserId.Should().Be(seeded.Id.ToString());
        User row = (await UsersByEmailAsync(email)).Should().ContainSingle().Subject;
        row.Id.Should().Be(seeded.Id);
        row.Subject.Should().Be(subject);
        row.LastLogin.Should().BeAfter(seeded.LastLogin);
        AssertNoUpsertFailure(scenario);
        scenario.UpsertLogs.Should().NotContain(e => e.Level == LogLevel.Warning);
    }

    [SkippableFact]
    public async Task NewSubject_NoEmailMatch_CreatesUserWithDefaultCollection()
    {
        string email = NewEmail();
        string subject = NewSubject();
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subject, email, emailVerified: false);

        who.UserId.Should().NotBeNull();
        Guid userId = Guid.Parse(who.UserId!);
        User row = (await UsersByEmailAsync(email)).Should().ContainSingle().Subject;
        row.Id.Should().Be(userId);
        row.Subject.Should().Be(subject);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Collection collection = await db.Collections.AsNoTracking().SingleAsync(c => c.CreatedBy == userId.ToString());
        UserSetting setting = await db.UserSettings.AsNoTracking().SingleAsync(s => s.UserId == userId && s.Key == "ActiveCollectionId");
        setting.Value.Should().Be(collection.Id.ToString());
        (await db.Audits.AnyAsync(a => a.Action == AuditAction.UserCreated && a.UserId == userId)).Should().BeTrue();
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task DuplicateKeyRace_EmailVerified_RelinksWinner()
    {
        string email = NewEmail();
        string subjectB = NewSubject();
        Guid winnerId = Guid.NewGuid();
        DuplicateEmailRaceInterceptor interceptor = new(fixture.ConnectionString, email, NewSubject(), winnerId);
        await using Scenario scenario = await StartAsync(interceptor);
        (int Collections, int Settings) before = await CountsAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subjectB, email, emailVerified: true);

        interceptor.Fired.Should().BeTrue();
        who.UserId.Should().Be(winnerId.ToString());
        User row = (await UsersByEmailAsync(email)).Should().ContainSingle().Subject;
        row.Id.Should().Be(winnerId);
        row.Subject.Should().Be(subjectB);
        row.LastLogin.Should().BeAfter(PastUtc);
        (int Collections, int Settings) after = await CountsAsync();
        after.Collections.Should().Be(before.Collections, "the losing insert is rolled back");
        after.Settings.Should().Be(before.Settings, "the losing insert is rolled back");
        AssertNoUpsertFailure(scenario);
        scenario.UpsertLogs.Should().Contain(e => e.Message.Contains("Duplicate key on insert - linked existing user"));
    }

    [SkippableFact]
    public async Task DuplicateKeyRace_EmailUnverified_Rejects()
    {
        string email = NewEmail();
        string subjectA = NewSubject();
        string subjectB = NewSubject();
        Guid winnerId = Guid.NewGuid();
        DuplicateEmailRaceInterceptor interceptor = new(fixture.ConnectionString, email, subjectA, winnerId);
        await using Scenario scenario = await StartAsync(interceptor);
        (int Collections, int Settings) before = await CountsAsync();

        await AssertRefusedAsync(scenario, subjectB, email, false);

        interceptor.Fired.Should().BeTrue();
        User row = (await UsersByEmailAsync(email)).Should().ContainSingle().Subject;
        row.Id.Should().Be(winnerId);
        row.Subject.Should().Be(subjectA);
        row.LastLogin.Should().Be(PastUtc);
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            (await db.Users.AnyAsync(u => u.Subject == subjectB)).Should().BeFalse();
        }

        (int Collections, int Settings) after = await CountsAsync();
        after.Collections.Should().Be(before.Collections);
        after.Settings.Should().Be(before.Settings);
        AssertNoUpsertFailure(scenario);
        CapturedLog warning = scenario.UpsertLogs.Should().ContainSingle(e => e.Level == LogLevel.Warning).Subject;
        warning.Message.Should().Contain("after duplicate key").And.Contain(subjectB).And.NotContain(email);
    }

    // ---- AC 4.1.8 / 4.1.9: no request runs as signed in without a user id ----

    /// <summary>Fails every attempt to save a new user row, as a database error during resolution would.</summary>
    private sealed class FailingUserInsertInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (eventData.Context!.ChangeTracker.Entries<User>().Any(e => e.State == EntityState.Added))
            {
                throw new InvalidOperationException("simulated database failure");
            }

            return ValueTask.FromResult(result);
        }
    }

    /// <summary>Commits another user with the same name just before the first new user is saved.</summary>
    private sealed class NameRaceInterceptor(PostgresContainerFixture fixture, string name) : SaveChangesInterceptor
    {
        private int _fired;

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            bool addingUser = eventData.Context!.ChangeTracker.Entries<User>().Any(e => e.State == EntityState.Added);
            if (addingUser && Interlocked.Exchange(ref _fired, 1) == 0)
            {
                await using ApplicationDbContext db = fixture.CreateDbContext();
                db.Users.Add(new User
                {
                    Id = Guid.NewGuid(), Subject = NewSubject(), Email = NewEmail(), Name = name,
                    LastLogin = PastUtc, CreatedAt = PastUtc
                });
                await db.SaveChangesAsync(cancellationToken);
            }

            return result;
        }
    }

    private static async Task<WhoAmI> ReadWhoAmIAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        WhoAmI? body = await response.Content.ReadFromJsonAsync<WhoAmI>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return body!;
    }

    [SkippableTheory]
    [InlineData("/test/public")]
    [InlineData("/test/anonymous")]
    public async Task AC_4_1_8_RefusedIdentity_IsAnonymousOnPublicEndpoints(string path)
    {
        string email = NewEmail();
        await SeedUserAsync(NewSubject(), email);
        await using Scenario scenario = await StartAsync();

        using HttpResponseMessage response = await GetAsync(scenario, path, NewSubject(), email, emailVerified: false);

        WhoAmI who = await ReadWhoAmIAsync(response);
        who.IsAuthenticated.Should().BeFalse();
        who.UserId.Should().BeNull();
    }

    [SkippableFact]
    public async Task AC_4_1_8_ResolutionFailure_Returns503WithRetryAfter_OnSignedInEndpoint()
    {
        await using Scenario scenario = await StartAsync(new FailingUserInsertInterceptor());

        using HttpResponseMessage response = await GetAsync(scenario, "/test/whoami", NewSubject(), NewEmail(), true);

        response.StatusCode.Should().Be(System.Net.HttpStatusCode.ServiceUnavailable);
        response.Headers.RetryAfter.Should().NotBeNull();
    }

    [SkippableFact]
    public async Task AC_4_1_8_ResolutionFailure_IsAnonymousOnPublicEndpoint()
    {
        await using Scenario scenario = await StartAsync(new FailingUserInsertInterceptor());

        using HttpResponseMessage response = await GetAsync(scenario, "/test/public", NewSubject(), NewEmail(), true);

        WhoAmI who = await ReadWhoAmIAsync(response);
        who.IsAuthenticated.Should().BeFalse();
    }

    [SkippableTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AC_4_1_9_NewUser_NameAlreadyUsed_IsCreatedWithSuffix(bool differentCase)
    {
        string taken = "Sam Taken " + Guid.NewGuid().ToString("N");
        await SeedUserAsync(NewSubject(), NewEmail(), taken, DateTime.UtcNow);
        string claim = differentCase ? taken.ToUpperInvariant() : taken;
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, NewSubject(), NewEmail(), emailVerified: true, name: claim);

        User? row = await UserByIdAsync(Guid.Parse(who.UserId!));
        row!.Name.Should().StartWith(claim + "-").And.HaveLength(claim.Length + 7);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableTheory]
    [InlineData(201)]
    [InlineData(2048)]
    public async Task AC_4_1_9_NewUser_NameTooLong_IsCreatedWithShortenedName(int length)
    {
        string claim = (Guid.NewGuid().ToString("N") + new string('x', length))[..length];
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, NewSubject(), NewEmail(), emailVerified: true, name: claim);

        User? row = await UserByIdAsync(Guid.Parse(who.UserId!));
        row!.Name.Should().Be(claim[..UserUpsertMiddleware.MaxNameLength]);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task AC_4_1_9_ExistingUserWithDefaultName_TakenNameClaim_IsSuffixed()
    {
        string taken = "Lee Taken " + Guid.NewGuid().ToString("N");
        await SeedUserAsync(NewSubject(), NewEmail(), taken, DateTime.UtcNow);
        string subject = NewSubject();
        string email = NewEmail();
        User seeded = await SeedUserAsync(subject, email, subject, PastUtc);
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subject, email, emailVerified: true, name: taken);

        who.UserId.Should().Be(seeded.Id.ToString());
        User? row = await UserByIdAsync(seeded.Id);
        row!.Name.Should().StartWith(taken + "-");
        row.LastLogin.Should().BeAfter(PastUtc);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task AC_4_1_9_NewUser_TakenNameThatLowersDifferentlyInTheDatabase_IsSuffixed()
    {
        string taken = "\u0130lker " + Guid.NewGuid().ToString("N");
        await SeedUserAsync(NewSubject(), NewEmail(), taken, DateTime.UtcNow);
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, NewSubject(), NewEmail(), emailVerified: true, name: taken);

        User? row = await UserByIdAsync(Guid.Parse(who.UserId!));
        row!.Name.Should().StartWith(taken + "-");
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task AC_4_1_9_NewUser_NameTakenBetweenCheckAndSave_IsRetriedWithSuffix()
    {
        string name = "Race Name " + Guid.NewGuid().ToString("N");
        NameRaceInterceptor interceptor = new(fixture, name);
        await using Scenario scenario = await StartAsync(interceptor);

        WhoAmI who = await WhoAmIAsync(scenario, NewSubject(), NewEmail(), emailVerified: true, name: name);

        User? row = await UserByIdAsync(Guid.Parse(who.UserId!));
        row!.Name.Should().StartWith(name + "-");
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task AC_4_1_10_NewUser_EmailShapedNameClaim_IsNotStoredAnywhere()
    {
        string claim = NewEmail();
        string subject = NewSubject();
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subject, NewEmail(), emailVerified: true, name: claim);

        User? row = await UserByIdAsync(Guid.Parse(who.UserId!));
        row!.Name.Should().Be(subject);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Collection collection = await db.Collections.SingleAsync(c => c.CreatedBy == who.UserId);
        collection.Name.Should().Be("Default Collection");
        collection.Description.Should().BeNull();
        AssertNoUpsertFailure(scenario);
    }

    [SkippableTheory]
    [InlineData("someone@example.com", null)]
    [InlineData("someone@example.com", "Google_1234567890")]
    [InlineData(null, "someone@example.com")]
    [InlineData(null, null)]
    public async Task AC_4_1_10_IdentifierValues_NeverNameTheDefaultCollection(string? name, string? cognitoUsername)
    {
        string subject = NewSubject();
        // A null username claim stands for the pool default, where it equals the subject.
        string username = cognitoUsername ?? subject;
        await using Scenario scenario = await StartAsync();
        string token = scenario.Host.CreateToken(
            subject, NewEmail(), emailVerified: true, name: name, cognitoUsername: username);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/test/whoami", token);

        using HttpResponseMessage response = await scenario.Host.Client.SendAsync(request);
        WhoAmI who = await ReadWhoAmIAsync(response);

        User? row = await UserByIdAsync(Guid.Parse(who.UserId!));
        row!.Name.Should().Be(subject);
        await using ApplicationDbContext db = fixture.CreateDbContext();
        Collection collection = await db.Collections.SingleAsync(c => c.CreatedBy == who.UserId);
        collection.Name.Should().Be("Default Collection");
        collection.Description.Should().BeNull();
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task AC_4_1_10_ExistingUserWithStoredEmailName_KeepsIt()
    {
        string subject = NewSubject();
        string email = NewEmail();
        User seeded = await SeedUserAsync(subject, email, email, PastUtc);
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subject, email, emailVerified: true, name: email);

        who.UserId.Should().Be(seeded.Id.ToString());
        (await UserByIdAsync(seeded.Id))!.Name.Should().Be(email);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task AC_4_1_8_TokenWithoutSubject_IsForbiddenOnSignedInEndpoint()
    {
        await using Scenario scenario = await StartAsync();
        string token = scenario.Host.CreateToken(NewSubject(), NewEmail(), omitSubject: true);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/test/whoami", token);

        using HttpResponseMessage response = await scenario.Host.Client.SendAsync(request);

        response.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    [SkippableFact]
    public async Task AC_4_1_8_UnresolvedAdmin_IsRefusedByAdminEndpoint_AndNotAdminElsewhere()
    {
        string email = NewEmail();
        await SeedUserAsync(NewSubject(), email);
        await using Scenario scenario = await StartAsync();
        string token = scenario.Host.CreateToken(NewSubject(), email, ["Admins"], emailVerified: false);

        using HttpRequestMessage adminRequest = JwtHttpTestHost.Request(HttpMethod.Get, "/test/admin", token);
        using HttpResponseMessage adminResponse = await scenario.Host.Client.SendAsync(adminRequest);
        using HttpRequestMessage publicRequest = JwtHttpTestHost.Request(HttpMethod.Get, "/test/is-admin", token);
        using HttpResponseMessage publicResponse = await scenario.Host.Client.SendAsync(publicRequest);

        adminResponse.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
        (await publicResponse.Content.ReadAsStringAsync()).Should().Be("false");
    }

    [SkippableFact]
    public async Task AC_4_1_8_UnresolvedUser_GetsNoPrivateItemFromTheRealItemRoutes()
    {
        string email = NewEmail();
        User owner = await SeedUserAsync(NewSubject(), email);
        string secret = "secret " + Guid.NewGuid().ToString("N");
        string categoryName = "c" + Guid.NewGuid().ToString("N")[..20];
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            Category category = new() { Id = Guid.NewGuid(), Name = categoryName, CreatedBy = owner.Id.ToString(), CreatedAt = DateTime.UtcNow };
            db.Categories.Add(category);
            db.Items.Add(new Item
            {
                Id = Guid.NewGuid(), IsPrivate = true, Question = secret, CorrectAnswer = "a", IncorrectAnswers = ["b"],
                Explanation = string.Empty, FuzzySignature = "A", FuzzyBucket = 1, CreatedBy = owner.Id.ToString(),
                CreatedAt = DateTime.UtcNow, CategoryId = category.Id
            });
            await db.SaveChangesAsync();
        }

        await using Scenario scenario = await StartAsync();
        string subject = NewSubject();

        using HttpResponseMessage list = await GetAsync(scenario, $"/items?category={categoryName}", subject, email, false);
        using HttpResponseMessage export = await GetAsync(scenario, $"/items/export?category={categoryName}", subject, email, false);

        list.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        (await list.Content.ReadAsStringAsync()).Should().NotContain(secret);
        export.StatusCode.Should().Be(System.Net.HttpStatusCode.Forbidden);
    }

    // ---- #328 cheap path: unchanged, recent logins take no transaction, row lock or write ----

    private static DateTime WholeSecondsAgo(TimeSpan age)
    {
        DateTime target = DateTime.UtcNow - age;
        return DateTime.SpecifyKind(target.AddTicks(-(target.Ticks % TimeSpan.TicksPerSecond)), DateTimeKind.Utc);
    }

    private async Task<User> SeedUserAsync(string subject, string email, string? name, DateTime lastLogin)
    {
        RequireDatabase();
        User user = new()
        {
            Id = Guid.NewGuid(),
            Subject = subject,
            Email = email,
            Name = name,
            LastLogin = lastLogin,
            CreatedAt = PastUtc
        };
        await using ApplicationDbContext db = fixture.CreateDbContext();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<int> LoginSuccessCountAsync(Guid userId)
    {
        await using ApplicationDbContext db = fixture.CreateDbContext();
        return await db.Audits.CountAsync(a => a.Action == AuditAction.LoginSuccess && a.UserId == userId);
    }

    private static void AssertLocked(SqlCaptureInterceptor sql)
    {
        sql.Count("FOR UPDATE").Should().BeGreaterThanOrEqualTo(1, "the locked upsert must run");
        sql.TransactionStarts.Should().BeGreaterThanOrEqualTo(1);
        sql.Count("UPDATE \"Users\"").Should().BeGreaterThanOrEqualTo(1);
    }

    private static void AssertSkipped(SqlCaptureInterceptor sql)
    {
        sql.Count("FOR UPDATE").Should().Be(0);
        sql.Count("pg_advisory_xact_lock").Should().Be(0);
        sql.Count("UPDATE \"Users\"").Should().Be(0);
        sql.TransactionStarts.Should().Be(0);
    }

    [SkippableFact]
    public async Task CheapPath_UnchangedRecentUser_TakesNoLockTransactionOrWrite()
    {
        string subject = NewSubject();
        string email = NewEmail();
        DateTime lastLogin = WholeSecondsAgo(TimeSpan.FromMinutes(1));
        User seeded = await SeedUserAsync(subject, email, $"custom-{Guid.NewGuid()}", lastLogin);
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        for (int i = 0; i < 5; i++)
        {
            WhoAmI who = await WhoAmIAsync(scenario, subject, email, emailVerified: true);
            who.UserId.Should().Be(seeded.Id.ToString());
        }

        sql.Commands.Should().NotBeEmpty("the cheap path still reads the row, proving the interceptor is attached");
        AssertSkipped(sql);
        User? row = await UserByIdAsync(seeded.Id);
        row!.LastLogin.Should().Be(lastLogin);
        (await LoginSuccessCountAsync(seeded.Id)).Should().Be(0);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableTheory]
    [InlineData("changed")]
    [InlineData("case")]
    public async Task CheapPath_EmailChanged_TakesLockedPathAndUpdatesEmail(string kind)
    {
        string subject = NewSubject();
        string email = "Mixed." + NewEmail();
        string requestEmail = kind == "case" ? email.ToLowerInvariant() : NewEmail();
        DateTime lastLogin = WholeSecondsAgo(TimeSpan.FromMinutes(1));
        User seeded = await SeedUserAsync(subject, email, $"custom-{Guid.NewGuid()}", lastLogin);
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        WhoAmI who = await WhoAmIAsync(scenario, subject, requestEmail, emailVerified: true);

        who.UserId.Should().Be(seeded.Id.ToString());
        AssertLocked(sql);
        (await UserByIdAsync(seeded.Id))!.Email.Should().Be(requestEmail);
        (await LoginSuccessCountAsync(seeded.Id)).Should().Be(0);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task CheapPath_DefaultName_NameClaimChanged_TakesLockedPathAndUpdatesName()
    {
        string subject = NewSubject();
        string email = NewEmail();
        User seeded = await SeedUserAsync(subject, email, subject, WholeSecondsAgo(TimeSpan.FromMinutes(1)));
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        await WhoAmIAsync(scenario, subject, email, emailVerified: true, name: "Fresh Name");

        AssertLocked(sql);
        (await UserByIdAsync(seeded.Id))!.Name.Should().Be("Fresh Name");
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task CheapPath_CustomName_NameClaimChanged_StillSkips()
    {
        string subject = NewSubject();
        string email = NewEmail();
        string customName = $"custom-{Guid.NewGuid()}";
        User seeded = await SeedUserAsync(subject, email, customName, WholeSecondsAgo(TimeSpan.FromMinutes(1)));
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        WhoAmI who = await WhoAmIAsync(scenario, subject, email, emailVerified: true, name: "Different");

        who.UserId.Should().Be(seeded.Id.ToString());
        AssertSkipped(sql);
        (await UserByIdAsync(seeded.Id))!.Name.Should().Be(customName);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task CheapPath_SevenMinutesStale_TakesLockedPathRefreshesLastLoginWithoutAudit()
    {
        string subject = NewSubject();
        string email = NewEmail();
        DateTime lastLogin = WholeSecondsAgo(TimeSpan.FromMinutes(7));
        User seeded = await SeedUserAsync(subject, email, $"custom-{Guid.NewGuid()}", lastLogin);
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        await WhoAmIAsync(scenario, subject, email, emailVerified: true);

        AssertLocked(sql);
        (await UserByIdAsync(seeded.Id))!.LastLogin.Should().BeAfter(lastLogin.AddMinutes(6));
        (await LoginSuccessCountAsync(seeded.Id)).Should().Be(0, "7 minutes is inside the 10-minute audit debounce");
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task CheapPath_PastAuditDebounce_WritesOneLoginSuccessThenSkips()
    {
        string subject = NewSubject();
        string email = NewEmail();
        User seeded = await SeedUserAsync(subject, email, $"custom-{Guid.NewGuid()}", PastUtc);
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        await WhoAmIAsync(scenario, subject, email, emailVerified: true);

        AssertLocked(sql);
        (await LoginSuccessCountAsync(seeded.Id)).Should().Be(1);
        int lockedBefore = sql.Count("FOR UPDATE");
        int transactionsBefore = sql.TransactionStarts;

        await WhoAmIAsync(scenario, subject, email, emailVerified: true);

        sql.Count("FOR UPDATE").Should().Be(lockedBefore, "the second request is inside the refresh interval");
        sql.TransactionStarts.Should().Be(transactionsBefore);
        (await LoginSuccessCountAsync(seeded.Id)).Should().Be(1);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task CheapPath_NewUser_IsCreatedWithLockThenNextRequestSkips()
    {
        string subject = NewSubject();
        string email = NewEmail();
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        WhoAmI first = await WhoAmIAsync(scenario, subject, email, emailVerified: true);

        first.UserId.Should().NotBeNull();
        sql.Count("pg_advisory_xact_lock").Should().BeGreaterThanOrEqualTo(1);
        sql.Count("FOR UPDATE").Should().BeGreaterThanOrEqualTo(1);
        sql.TransactionStarts.Should().BeGreaterThanOrEqualTo(1);
        int lockedBefore = sql.Count("FOR UPDATE");
        int transactionsBefore = sql.TransactionStarts;
        int advisoryBefore = sql.Count("pg_advisory_xact_lock");

        WhoAmI second = await WhoAmIAsync(scenario, subject, email, emailVerified: true);

        second.UserId.Should().Be(first.UserId);
        sql.Count("FOR UPDATE").Should().Be(lockedBefore);
        sql.Count("pg_advisory_xact_lock").Should().Be(advisoryBefore);
        sql.TransactionStarts.Should().Be(transactionsBefore);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task VerifiedRelink_StillTakesAdvisoryLockAndRowLock()
    {
        string seededEmail = "Relink." + NewEmail();
        User seeded = await SeedUserAsync(NewSubject(), seededEmail);
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        WhoAmI who = await WhoAmIAsync(scenario, NewSubject(), seededEmail.ToLowerInvariant(), emailVerified: true);

        who.UserId.Should().Be(seeded.Id.ToString());
        sql.Count("pg_advisory_xact_lock").Should().BeGreaterThanOrEqualTo(1);
        sql.Count("FOR UPDATE").Should().BeGreaterThanOrEqualTo(2, "the subject lookup and the by-email row lock");
        sql.TransactionStarts.Should().BeGreaterThanOrEqualTo(1);
        sql.Count("UPDATE \"Users\"").Should().BeGreaterThanOrEqualTo(1);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableFact]
    public async Task CheapPath_FutureLastLogin_TakesLockedPathAndRepairsLastLogin()
    {
        string subject = NewSubject();
        string email = NewEmail();
        User seeded = await SeedUserAsync(subject, email, $"custom-{Guid.NewGuid()}", WholeSecondsAgo(TimeSpan.FromHours(-1)));
        SqlCaptureInterceptor sql = new();
        await using Scenario scenario = await StartAsync(sql);

        await WhoAmIAsync(scenario, subject, email, emailVerified: true);

        AssertLocked(sql);
        (await UserByIdAsync(seeded.Id))!.LastLogin.Should().BeBefore(DateTime.UtcNow.AddMinutes(1));
        (await LoginSuccessCountAsync(seeded.Id)).Should().Be(0);
        AssertNoUpsertFailure(scenario);
    }

    [SkippableTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AuthenticatedTokenWithoutSubject_InvokesDownstreamExactlyOnce(bool endpointThrows)
    {
        RequireDatabase();
        int invocations = 0;
        await using JwtHttpTestHost host = await JwtHttpTestHost.StartAsync(
            () => fixture.CreateDbContext(),
            _ => { },
            app => app.MapGet("/test/count", () =>
                {
                    Interlocked.Increment(ref invocations);
                    return endpointThrows
                        ? throw new InvalidOperationException("downstream failure")
                        : Results.Ok();
                }),
            useUserUpsertMiddleware: true);
        string token = host.CreateToken(NewSubject(), NewEmail(), omitSubject: true);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/test/count", token);

        using HttpResponseMessage response = await host.Client.SendAsync(request);

        response.StatusCode.Should().Be(endpointThrows ? System.Net.HttpStatusCode.InternalServerError : System.Net.HttpStatusCode.OK);
        invocations.Should().Be(1, "the middleware must call the next delegate exactly once, even when it throws");
    }
}
