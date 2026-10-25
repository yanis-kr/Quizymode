using FluentAssertions;
using Npgsql;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.StartupExtensions;
using Xunit;

namespace Quizymode.Api.Tests.StartupExtensions;

/// <summary>#339: the Npgsql pool is capped by default without overriding an explicit connection string value.</summary>
public sealed class PostgreSqlConnectionStringDefaultsTests
{
    private const string Base = "Host=h;Port=6543;Database=d;Username=u;Password=p;SSL Mode=Require;Trust Server Certificate=true";

    private static NpgsqlConnectionStringBuilder Parse(string cs) => new(cs);

    [Fact]
    public void Apply_NoPoolKeys_UsesDefaults()
    {
        NpgsqlConnectionStringBuilder result = Parse(PostgreSqlConnectionStringDefaults.Apply(Base, new DatabaseOptions()));

        result.MaxPoolSize.Should().Be(5);
        result.ConnectionIdleLifetime.Should().Be(60);
    }

    [Theory]
    [InlineData("Maximum Pool Size=20")]
    [InlineData("MaxPoolSize=20")]
    [InlineData("maximum pool size=20")]
    [InlineData("MAXPOOLSIZE=20")]
    public void Apply_ExplicitMaxPoolSize_IsKept(string pair)
    {
        Parse($"{Base};{pair}").MaxPoolSize.Should().Be(20);

        NpgsqlConnectionStringBuilder result = Parse(PostgreSqlConnectionStringDefaults.Apply($"{Base};{pair}", new DatabaseOptions()));

        result.MaxPoolSize.Should().Be(20);
    }

    [Fact]
    public void NpgsqlItself_RejectsMaxPoolSizeSpelling()
    {
        Action act = () => Parse($"{Base};Max Pool Size=20");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Apply_ExplicitIdleLifetime_IsKept_AndMaxPoolSizeStillDefaults()
    {
        NpgsqlConnectionStringBuilder result = Parse(
            PostgreSqlConnectionStringDefaults.Apply($"{Base};Connection Idle Lifetime=300", new DatabaseOptions()));

        result.ConnectionIdleLifetime.Should().Be(300);
        result.MaxPoolSize.Should().Be(5);
    }

    [Fact]
    public void Apply_OptionValues_AreApplied()
    {
        NpgsqlConnectionStringBuilder result = Parse(PostgreSqlConnectionStringDefaults.Apply(
            Base, new DatabaseOptions { MaxPoolSize = 8, ConnectionIdleLifetimeSeconds = 30 }));

        result.MaxPoolSize.Should().Be(8);
        result.ConnectionIdleLifetime.Should().Be(30);
    }

    [Fact]
    public void Apply_MinPoolSizeAboveCap_RaisesMaxToMin()
    {
        string cs = PostgreSqlConnectionStringDefaults.Apply($"{Base};Minimum Pool Size=10", new DatabaseOptions());

        Parse(cs).MaxPoolSize.Should().Be(10);
        Action build = () => NpgsqlDataSource.Create(cs).Dispose();
        build.Should().NotThrow();
    }

    [Fact]
    public void Apply_PreservesOtherSettings()
    {
        NpgsqlConnectionStringBuilder expected = Parse(Base);

        NpgsqlConnectionStringBuilder result = Parse(PostgreSqlConnectionStringDefaults.Apply(Base, new DatabaseOptions()));

        result.Host.Should().Be(expected.Host);
        result.Port.Should().Be(expected.Port);
        result.Database.Should().Be(expected.Database);
        result.Username.Should().Be(expected.Username);
        result.Password.Should().Be(expected.Password);
        result.SslMode.Should().Be(expected.SslMode);
        result.TrustServerCertificate.Should().Be(expected.TrustServerCertificate);
    }

    [Theory]
    [InlineData(0, 60, "Database:MaxPoolSize")]
    [InlineData(5, 0, "Database:ConnectionIdleLifetimeSeconds")]
    [InlineData(5, 5, "Database:ConnectionIdleLifetimeSeconds")]
    public void Apply_InvalidOptions_ThrowsNamingTheKey(int maxPoolSize, int idleSeconds, string key)
    {
        DatabaseOptions options = new() { MaxPoolSize = maxPoolSize, ConnectionIdleLifetimeSeconds = idleSeconds };

        Action act = () => PostgreSqlConnectionStringDefaults.Apply(Base, options);

        act.Should().Throw<InvalidOperationException>().WithMessage($"*{key}*");
    }

    [Theory]
    [InlineData(10)]
    [InlineData(60)]
    public void Apply_IdleLifetimeAtOrAbovePruningInterval_IsAccepted(int idleSeconds)
    {
        string cs = PostgreSqlConnectionStringDefaults.Apply(Base, new DatabaseOptions { ConnectionIdleLifetimeSeconds = idleSeconds });

        Parse(cs).ConnectionIdleLifetime.Should().Be(idleSeconds);
        Action build = () => NpgsqlDataSource.Create(cs).Dispose();
        build.Should().NotThrow();
    }
}
