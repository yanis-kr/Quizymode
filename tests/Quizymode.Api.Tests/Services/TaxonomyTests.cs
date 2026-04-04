using FluentAssertions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Shared.Taxonomy;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class TaxonomyYamlLoaderTests : IDisposable
{
    private readonly string _tempDir;

    public TaxonomyYamlLoaderTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"taxonomy_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    private string WriteYaml(string content)
    {
        string path = Path.Combine(_tempDir, "taxonomy.yaml");
        File.WriteAllText(path, content);
        return path;
    }

    private static Mock<IHostEnvironment> MockEnvironment(string contentRoot) =>
        new Mock<IHostEnvironment>().Also(m => m.SetupGet(e => e.ContentRootPath).Returns(contentRoot));

    [Fact]
    public void ResolveYamlPath_ReturnsAbsolutePath_WhenAbsolutePathProvided()
    {
        string yamlPath = WriteYaml(MinimalYaml);
        var env = MockEnvironment(_tempDir);
        var options = new TaxonomyOptions { YamlRelativePath = yamlPath };

        string resolved = TaxonomyYamlLoader.ResolveYamlPath(env.Object, options);

        resolved.Should().Be(yamlPath);
    }

    [Fact]
    public void ResolveYamlPath_FindsFile_UnderContentRoot()
    {
        string yamlPath = WriteYaml(MinimalYaml);
        string fileName = Path.GetFileName(yamlPath);
        var env = MockEnvironment(_tempDir);
        var options = new TaxonomyOptions { YamlRelativePath = fileName };

        string resolved = TaxonomyYamlLoader.ResolveYamlPath(env.Object, options);

        resolved.Should().Be(yamlPath);
    }

    [Fact]
    public void ResolveYamlPath_Throws_WhenFileNotFound()
    {
        var env = MockEnvironment(_tempDir);
        var options = new TaxonomyOptions { YamlRelativePath = "nonexistent.yaml" };

        Action act = () => TaxonomyYamlLoader.ResolveYamlPath(env.Object, options);

        act.Should().Throw<FileNotFoundException>();
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }

    private const string MinimalYaml = """
        exams:
          description: Exam prep
          keywords:
            general:
              description: Mixed exams
              keywords:
                general: Mixed exams
                mixed: Any exam mix
        """;
}

public sealed class TaxonomyYamlParserTests : IDisposable
{
    private readonly string _tempDir;

    public TaxonomyYamlParserTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"taxonomy_parser_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    private string WriteYaml(string content)
    {
        string path = Path.Combine(_tempDir, "taxonomy.yaml");
        File.WriteAllText(path, content);
        return path;
    }

    [Fact]
    public void LoadFromFile_ParsesSingleCategory()
    {
        string path = WriteYaml("""
            exams:
              description: Exam prep for certifications
              keywords:
                aws:
                  description: AWS certs
                  keywords:
                    saa-c03: Arch associate
                    ccp: Cloud basics
            """);

        var result = TaxonomyYamlParser.LoadFromFile(path);

        result.Should().ContainKey("exams");
        result["exams"].L1Groups.Should().ContainSingle(g => g.Slug == "aws");
        result["exams"].AllKeywordSlugs.Should().Contain("saa-c03").And.Contain("ccp").And.Contain("aws");
    }

    [Fact]
    public void LoadFromFile_ParsesMultipleCategories()
    {
        string path = WriteYaml("""
            cat1:
              description: Category one
              keywords:
                group1:
                  description: Group one
                  keywords:
                    leaf1: Leaf one
            cat2:
              description: Category two
              keywords:
                group2:
                  description: Group two
                  keywords:
                    leaf2: Leaf two
            """);

        var result = TaxonomyYamlParser.LoadFromFile(path);

        result.Should().HaveCount(2);
        result.Should().ContainKey("cat1").And.ContainKey("cat2");
    }

    [Fact]
    public void LoadFromFile_SkipsConcernsEntry()
    {
        string path = WriteYaml("""
            concerns:
              note: meta entry
            exams:
              description: Exam prep
              keywords:
                general:
                  description: General
                  keywords:
                    mixed: Any
            """);

        var result = TaxonomyYamlParser.LoadFromFile(path);

        result.Should().NotContainKey("concerns");
        result.Should().ContainKey("exams");
    }

    [Fact]
    public void LoadFromFile_Throws_WhenFileIsEmpty()
    {
        string path = WriteYaml("");
        Action act = () => TaxonomyYamlParser.LoadFromFile(path);
        act.Should().Throw<InvalidOperationException>().WithMessage("*empty*");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}

public sealed class TaxonomyRegistryTests : IDisposable
{
    private readonly string _tempDir;
    private readonly TaxonomyRegistry _registry;

    private const string RegistryYaml = """
        exams:
          description: Exam prep
          keywords:
            aws:
              description: AWS certs
              keywords:
                saa-c03: Arch associate
                ccp: Cloud basics
                dva-c02: Dev associate
        programming:
          description: Programming languages
          keywords:
            dotnet:
              description: .NET
              keywords:
                csharp: C# language
                aspnet: ASP.NET
        """;

    public TaxonomyRegistryTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"taxonomy_reg_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
        string yamlPath = Path.Combine(_tempDir, "taxonomy.yaml");
        File.WriteAllText(yamlPath, RegistryYaml);

        var env = new Mock<IHostEnvironment>();
        env.SetupGet(e => e.ContentRootPath).Returns(_tempDir);

        var options = Options.Create(new TaxonomyOptions { YamlRelativePath = "taxonomy.yaml" });
        _registry = new TaxonomyRegistry(env.Object, options, NullLogger<TaxonomyRegistry>.Instance);
    }

    [Fact]
    public void CategorySlugs_ContainsAllLoadedCategories()
    {
        _registry.CategorySlugs.Should().Contain("exams").And.Contain("programming");
    }

    [Fact]
    public void HasCategory_ReturnsTrue_ForKnownCategory()
    {
        _registry.HasCategory("exams").Should().BeTrue();
    }

    [Fact]
    public void HasCategory_ReturnsFalse_ForUnknownCategory()
    {
        _registry.HasCategory("unknowncat").Should().BeFalse();
    }

    [Fact]
    public void HasCategory_IsCaseInsensitive()
    {
        _registry.HasCategory("EXAMS").Should().BeTrue();
        _registry.HasCategory("Exams").Should().BeTrue();
    }

    [Fact]
    public void HasCategory_ReturnsFalse_ForWhitespace()
    {
        _registry.HasCategory("   ").Should().BeFalse();
        _registry.HasCategory("").Should().BeFalse();
    }

    [Fact]
    public void GetCategory_ReturnsDefinition_ForKnownCategory()
    {
        var cat = _registry.GetCategory("exams");
        cat.Should().NotBeNull();
        cat!.Slug.Should().Be("exams");
        cat.L1Groups.Should().ContainSingle(g => g.Slug == "aws");
    }

    [Fact]
    public void GetCategory_ReturnsNull_ForUnknownCategory()
    {
        _registry.GetCategory("nope").Should().BeNull();
    }

    [Fact]
    public void IsValidNavigationPath_ReturnsTrue_ForValidL1AndL2()
    {
        _registry.IsValidNavigationPath("exams", "aws", "saa-c03").Should().BeTrue();
    }

    [Fact]
    public void IsValidNavigationPath_ReturnsFalse_ForInvalidL2()
    {
        _registry.IsValidNavigationPath("exams", "aws", "nonexistent").Should().BeFalse();
    }

    [Fact]
    public void IsValidNavigationPath_ReturnsFalse_ForInvalidL1()
    {
        _registry.IsValidNavigationPath("exams", "azure", "saa-c03").Should().BeFalse();
    }

    [Fact]
    public void IsValidNavigationPath_ReturnsFalse_ForUnknownCategory()
    {
        _registry.IsValidNavigationPath("unknown", "aws", "saa-c03").Should().BeFalse();
    }

    [Fact]
    public void IsTaxonomyKeywordInCategory_ReturnsTrue_ForKnownKeyword()
    {
        _registry.IsTaxonomyKeywordInCategory("exams", "saa-c03").Should().BeTrue();
        _registry.IsTaxonomyKeywordInCategory("exams", "aws").Should().BeTrue();
    }

    [Fact]
    public void IsTaxonomyKeywordInCategory_ReturnsFalse_ForKeywordInOtherCategory()
    {
        _registry.IsTaxonomyKeywordInCategory("programming", "saa-c03").Should().BeFalse();
    }

    [Fact]
    public void IsTaxonomyKeywordInCategory_ReturnsFalse_ForUnknownKeyword()
    {
        _registry.IsTaxonomyKeywordInCategory("exams", "nope").Should().BeFalse();
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, recursive: true);
    }
}

// Extension helper to allow fluent setup on Mock<T>
file static class MockExtensions
{
    public static Mock<T> Also<T>(this Mock<T> mock, Action<Mock<T>> configure) where T : class
    {
        configure(mock);
        return mock;
    }
}
