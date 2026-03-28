using Quizymode.Api.Features;

namespace Quizymode.Api.StartupExtensions;

internal static class FeatureRegistrationExtensions
{
    public static WebApplicationBuilder AddFeatureRegistrations(this WebApplicationBuilder builder)
    {
        // Scan assembly for IFeatureRegistration implementations and register them
        List<Type> featureRegistrationTypes = typeof(IFeatureRegistration).Assembly
            .GetTypes()
            .Where(t => t.IsClass && 
                       !t.IsAbstract && 
                       t.GetInterfaces().Contains(typeof(IFeatureRegistration)))
            .OrderBy(t => t.FullName, StringComparer.Ordinal)
            .ToList();

        // Execute each feature registration directly
        foreach (Type registrationType in featureRegistrationTypes)
        {
            if (Activator.CreateInstance(registrationType) is IFeatureRegistration registration)
            {
                registration.AddToServiceCollection(builder.Services, builder.Configuration);
            }
        }

        return builder;
    }

    public static WebApplication MapFeatureEndpoints(this WebApplication app)
    {
        // Auto-discover and map all IEndpoint implementations
        List<Type> endpointTypes = typeof(IEndpoint).Assembly
            .GetTypes()
            .Where(t => t.IsClass && 
                       !t.IsAbstract && 
                       t.GetInterfaces().Contains(typeof(IEndpoint)))
            .OrderBy(t => t.FullName, StringComparer.Ordinal)
            .ToList();

        foreach (Type endpointType in endpointTypes)
        {
            if (Activator.CreateInstance(endpointType) is IEndpoint endpoint)
            {
                endpoint.MapEndpoint(app);
            }
        }

        return app;
    }
}

