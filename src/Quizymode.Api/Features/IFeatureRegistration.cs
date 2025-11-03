namespace Quizymode.Api.Features;

public interface IFeatureRegistration
{
    void AddToServiceCollection(IServiceCollection services, IConfiguration configuration);
}

