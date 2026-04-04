using FluentAssertions;
using NetArchTest.Rules;
using Xunit;

namespace Quizymode.Api.Tests.Architecture;

public sealed class LayerDependencyTests : ArchitectureTestBase
{
    [Fact]
    public void Shared_Should_Not_Depend_On_Features()
    {
        TestResult result = Types.InAssembly(ApiAssembly)
            .That()
            .ResideInNamespaceStartingWith(SharedNamespace)
            .ShouldNot()
            .HaveDependencyOn(FeaturesNamespace)
            .GetResult();

        result.IsSuccessful.Should().BeTrue(DescribeFailingTypes(result));
    }

    [Fact]
    public void Shared_Should_Not_Depend_On_StartupExtensions()
    {
        TestResult result = Types.InAssembly(ApiAssembly)
            .That()
            .ResideInNamespaceStartingWith(SharedNamespace)
            .ShouldNot()
            .HaveDependencyOn(StartupExtensionsNamespace)
            .GetResult();

        result.IsSuccessful.Should().BeTrue(DescribeFailingTypes(result));
    }

    [Fact]
    public void Data_Should_Not_Depend_On_Features()
    {
        TestResult result = Types.InAssembly(ApiAssembly)
            .That()
            .ResideInNamespaceStartingWith(DataNamespace)
            .ShouldNot()
            .HaveDependencyOn(FeaturesNamespace)
            .GetResult();

        result.IsSuccessful.Should().BeTrue(DescribeFailingTypes(result));
    }

    [Fact]
    public void Features_Should_Not_Depend_On_StartupExtensions()
    {
        TestResult result = Types.InAssembly(ApiAssembly)
            .That()
            .ResideInNamespaceStartingWith(FeaturesNamespace)
            .ShouldNot()
            .HaveDependencyOn(StartupExtensionsNamespace)
            .GetResult();

        result.IsSuccessful.Should().BeTrue(DescribeFailingTypes(result));
    }

    [Fact]
    public void Services_Should_Not_Depend_On_StartupExtensions()
    {
        TestResult result = Types.InAssembly(ApiAssembly)
            .That()
            .ResideInNamespaceStartingWith(ServicesNamespace)
            .ShouldNot()
            .HaveDependencyOn(StartupExtensionsNamespace)
            .GetResult();

        result.IsSuccessful.Should().BeTrue(DescribeFailingTypes(result));
    }
}
