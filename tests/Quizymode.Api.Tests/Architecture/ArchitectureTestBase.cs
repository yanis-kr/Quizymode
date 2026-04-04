using NetArchTest.Rules;
using Quizymode.Api.Data;
using Xunit;
using SystemReflectionAssembly = System.Reflection.Assembly;
using SystemType = System.Type;

namespace Quizymode.Api.Tests.Architecture;

public abstract class ArchitectureTestBase
{
    protected static readonly SystemReflectionAssembly ApiAssembly = typeof(ApplicationDbContext).Assembly;
    protected static readonly SystemType[] ApiTypes = ApiAssembly.GetTypes();

    protected const string DataNamespace = "Quizymode.Api.Data";
    protected const string FeaturesNamespace = "Quizymode.Api.Features";
    protected const string ServicesNamespace = "Quizymode.Api.Services";
    protected const string SharedNamespace = "Quizymode.Api.Shared";
    protected const string StartupExtensionsNamespace = "Quizymode.Api.StartupExtensions";

    protected static bool IsFeatureNamespace(string? value)
    {
        return value is not null &&
               (value.Equals(FeaturesNamespace, StringComparison.Ordinal) ||
                value.StartsWith($"{FeaturesNamespace}.", StringComparison.Ordinal));
    }

    protected static bool IsFeatureType(SystemType type)
    {
        return type.IsClass &&
               type.IsAbstract &&
               type.IsSealed &&
               IsFeatureNamespace(type.Namespace);
    }

    protected static string DescribeFailingTypes(TestResult result)
    {
        if (result.FailingTypes is null || result.FailingTypes.Count == 0)
        {
            return "because no failing types were reported";
        }

        return $"because these types failed: {string.Join(", ", result.FailingTypes.Select(type => type.FullName))}";
    }
}
