using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Features;
using Xunit;

namespace Quizymode.Api.Tests.Architecture;

public sealed class VerticalSliceConventionTests : ArchitectureTestBase
{
    [Fact]
    public void Endpoints_Should_Be_Nested_And_Named_Endpoint()
    {
        System.Type[] endpointTypes = ApiTypes
            .Where(type => type.IsClass && !type.IsAbstract && typeof(IEndpoint).IsAssignableFrom(type))
            .ToArray();

        endpointTypes.Should().NotBeEmpty();
        endpointTypes.Should().OnlyContain(type =>
            type.Name == "Endpoint" &&
            type.DeclaringType != null &&
            IsFeatureType(type.DeclaringType));
    }

    [Fact]
    public void FeatureRegistrations_Should_Be_Nested_And_Named_FeatureRegistration()
    {
        System.Type[] registrationTypes = ApiTypes
            .Where(type => type.IsClass && !type.IsAbstract && typeof(IFeatureRegistration).IsAssignableFrom(type))
            .ToArray();

        registrationTypes.Should().NotBeEmpty();
        registrationTypes.Should().OnlyContain(type =>
            type.Name == "FeatureRegistration" &&
            type.DeclaringType != null &&
            IsFeatureType(type.DeclaringType));
    }

    [Fact]
    public void Handlers_Should_Be_Internal_And_Colocated_With_Their_Feature()
    {
        System.Type[] handlerTypes = ApiTypes
            .Where(type =>
                type.IsClass &&
                type.Name.EndsWith("Handler", StringComparison.Ordinal) &&
                IsFeatureNamespace(type.Namespace))
            .ToArray();

        handlerTypes.Should().NotBeEmpty();

        foreach (System.Type handlerType in handlerTypes)
        {
            handlerType.IsNotPublic.Should().BeTrue($"{handlerType.FullName} should be internal");
            handlerType.IsAbstract.Should().BeTrue($"{handlerType.FullName} should be static");
            handlerType.IsSealed.Should().BeTrue($"{handlerType.FullName} should be static");

            string featureTypeName = handlerType.Name[..^"Handler".Length];
            System.Type? featureType = ApiTypes.SingleOrDefault(type =>
                type.Name == featureTypeName &&
                type.Namespace == handlerType.Namespace &&
                IsFeatureType(type));

            featureType.Should().NotBeNull(
                $"{handlerType.FullName} should be colocated with a {featureTypeName} feature type in the same namespace");
        }
    }

    [Fact]
    public void EntityTypeConfigurations_Should_Be_Internal_And_Sealed()
    {
        System.Type configurationInterfaceType = typeof(IEntityTypeConfiguration<>);

        System.Type[] configurationTypes = ApiTypes
            .Where(type =>
                type.IsClass &&
                !type.IsAbstract &&
                type.GetInterfaces().Any(iface =>
                    iface.IsGenericType &&
                    iface.GetGenericTypeDefinition() == configurationInterfaceType))
            .ToArray();

        configurationTypes.Should().NotBeEmpty();
        configurationTypes.Should().OnlyContain(type => type.IsSealed && !type.IsPublic);
    }

    [Fact]
    public void Api_Should_Not_Contain_Mvc_Controllers()
    {
        System.Type[] controllerTypes = ApiTypes
            .Where(type =>
                type.IsClass &&
                !type.IsAbstract &&
                (type.Name.EndsWith("Controller", StringComparison.Ordinal) ||
                 typeof(ControllerBase).IsAssignableFrom(type)))
            .ToArray();

        controllerTypes.Should().BeEmpty();
    }
}
