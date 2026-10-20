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
            app => app.MapGet("/test/whoami", (IUserContext userContext) =>
                    Results.Ok(new { isAuthenticated = userContext.IsAuthenticated, userId = userContext.UserId }))
                .RequireAuthorization(),
            useUserUpsertMiddleware: true);
        return new Scenario { Host = host, Logs = logs };
    }

    private static async Task<WhoAmI> WhoAmIAsync(Scenario scenario, string subject, string email, object? emailVerified)
    {
        string token = scenario.Host.CreateToken(subject, email, emailVerified: emailVerified);
        using HttpRequestMessage request = JwtHttpTestHost.Request(HttpMethod.Get, "/test/whoami", token);
        using HttpResponseMessage response = await scenario.Host.Client.SendAsync(request);
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        WhoAmI? body = await response.Content.ReadFromJsonAsync<WhoAmI>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
        body.Should().NotBeNull();
        body!.IsAuthenticated.Should().BeTrue();
        return body;
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
        await using Scenario scenario = await StartAsync();

        WhoAmI who = await WhoAmIAsync(scenario, subjectB, requestEmail, emailVerified);

        who.UserId.Should().BeNull();
        User? after = await UserByIdAsync(seeded.Id);
        after.Should().NotBeNull();
        after!.Subject.Should().Be(subjectA);
        after.Email.Should().Be(seededEmail);
        after.LastLogin.Should().Be(seeded.LastLogin);
        (await UsersByEmailAsync(requestEmail)).Should().ContainSingle();
        await using (ApplicationDbContext db = fixture.CreateDbContext())
        {
            (await db.Users.AnyAsync(u => u.Subject == subjectB)).Should().BeFalse();
            (await db.Audits.AnyAsync(a => a.Action == AuditAction.UserCreated && a.UserId == seeded.Id)).Should().BeFalse();
        }

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

        WhoAmI who = await WhoAmIAsync(scenario, subjectB, email, emailVerified: false);

        interceptor.Fired.Should().BeTrue();
        who.UserId.Should().BeNull();
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
}
