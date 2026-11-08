using Quizymode.Api.Features;

namespace Quizymode.Api.Shared.Email;

/// <summary>Registers the shared email options and sender once: SMTP when <c>Email:Smtp:Host</c> is set, otherwise a no-op sender.</summary>
internal sealed class EmailRegistration : IFeatureRegistration
{
    public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<EmailOptions>().Bind(configuration.GetSection(EmailOptions.SectionName));
        if (!string.IsNullOrWhiteSpace(configuration[$"{EmailOptions.SectionName}:Smtp:Host"]))
        {
            services.AddSingleton<IEmailSender, SmtpEmailSender>();
        }
        else
        {
            services.AddSingleton<IEmailSender, NoOpEmailSender>();
        }
    }
}
