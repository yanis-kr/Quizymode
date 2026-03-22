using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Minimal <see cref="IHostEnvironment"/> so <see cref="Quizymode.Api.Services.Taxonomy.TaxonomyRegistry"/>
/// can resolve taxonomy YAML copied next to the test assembly.
/// </summary>
internal sealed class TestHostEnvironment : IHostEnvironment
{
    public TestHostEnvironment()
    {
        ContentRootPath = AppContext.BaseDirectory;
        ContentRootFileProvider = new NullFileProvider();
    }

    public string EnvironmentName { get; set; } = Environments.Development;
    public string ApplicationName { get; set; } = "Quizymode.Api.Tests";
    public string ContentRootPath { get; set; }
    public IFileProvider ContentRootFileProvider { get; set; }
}
