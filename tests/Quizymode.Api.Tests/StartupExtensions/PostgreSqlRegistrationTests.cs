using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Quizymode.Api.Data;
using Quizymode.Api.StartupExtensions;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>#339: the production registration applies the pool cap to the DbContext connection string.</summary>
[Trait("Category", "Postgres")]
public sealed class PostgreSqlRegistrationTests(PostgresContainerFixture fixture) : IClassFixture<PostgresContainerFixture>
{
    private static ServiceProvider Build(Dictionary<string, string?> config)
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = AppContext.BaseDirectory });
        builder.Configuration.AddInMemoryCollection(config);
        builder.AddPostgreSqlServices();
        return builder.Services.BuildServiceProvider();
    }

    private static NpgsqlConnectionStringBuilder Effective(ServiceProvider provider)
    {
        using IServiceScope scope = provider.CreateScope();
        ApplicationDbContext db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return new NpgsqlConnectionStringBuilder(db.Database.GetConnectionString());
    }

    [Fact]
    public void Registration_DefaultsToPoolCapOfFive()
    {
        using ServiceProvider provider = Build(new() { ["ConnectionStrings:PostgreSQL"] = "Host=h;Database=d;Username=u;Password=p" });

        NpgsqlConnectionStringBuilder cs = Effective(provider);

        cs.MaxPoolSize.Should().Be(5);
        cs.ConnectionIdleLifetime.Should().Be(60);
    }

    [Fact]
    public void Registration_ConfigOverridesDefaults()
    {
        using ServiceProvider provider = Build(new()
        {
            ["ConnectionStrings:PostgreSQL"] = "Host=h;Database=d;Username=u;Password=p",
            ["Database:MaxPoolSize"] = "7",
        });

        Effective(provider).MaxPoolSize.Should().Be(7);
    }

    [Fact]
    public void Registration_AspireConnectionStringWithExplicitMax_IsKept()
    {
        using ServiceProvider provider = Build(new()
        {
            ["ConnectionStrings:PostgreSQL"] = "Host=other;Database=d;Username=u;Password=p",
            ["ConnectionStrings:quizymode"] = "Host=aspire;Database=d;Username=u;Password=p;Maximum Pool Size=12",
        });

        NpgsqlConnectionStringBuilder cs = Effective(provider);

        cs.Host.Should().Be("aspire");
        cs.MaxPoolSize.Should().Be(12);
    }

    [Fact]
    public void Registration_InvalidMaxPoolSize_FailsFast()
    {
        Action act = () => Build(new()
        {
            ["ConnectionStrings:PostgreSQL"] = "Host=h;Database=d;Username=u;Password=p",
            ["Database:MaxPoolSize"] = "0",
        });

        act.Should().Throw<InvalidOperationException>().WithMessage("*Database:MaxPoolSize*");
    }

    [SkippableFact]
    public async Task Registration_PoolCap_SixthConcurrentConnectionFails_ThenSucceedsAfterRelease()
    {
        Skip.If(fixture.UnavailableReason is not null, fixture.UnavailableReason);
        using ServiceProvider provider = Build(new()
        {
            ["ConnectionStrings:PostgreSQL"] = fixture.ConnectionString + ";Timeout=30",
            ["Database:MaxPoolSize"] = "5",
        });

        List<IServiceScope> scopes = [];
        try
        {
            for (int i = 0; i < 5; i++)
            {
                IServiceScope scope = provider.CreateScope();
                scopes.Add(scope);
                await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.OpenConnectionAsync();
            }

            using IServiceScope sixth = provider.CreateScope();
            ApplicationDbContext db6 = sixth.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            // A cancellation token (not a short Timeout=, which also governs connect time) bounds the sixth open.
            using CancellationTokenSource cts = new(TimeSpan.FromSeconds(1));
            Func<Task> open = () => db6.Database.OpenConnectionAsync(cts.Token);
            await open.Should().ThrowAsync<OperationCanceledException>("the pool is capped at 5 and the sixth open waits until cancelled");

            await scopes[0].ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.CloseConnectionAsync();
            await db6.Database.OpenConnectionAsync();
            await db6.Database.CloseConnectionAsync();
        }
        finally
        {
            foreach (IServiceScope scope in scopes)
            {
                scope.Dispose();
            }
        }
    }
}
