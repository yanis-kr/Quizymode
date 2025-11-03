using Microsoft.OpenApi.Models;

namespace Quizymode.Api.StartupExtensions;

internal static partial class StartupExtensions
{
    public static WebApplicationBuilder AddSwaggerServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddOpenApi();
        //builder.Services.AddSwaggerGen(c =>
        //{
            //c.SwaggerDoc("v1", new OpenApiInfo
            //{
            //    Title = "QuizyMode API",
            //    Version = "v1",
            //    Description = "An API for quiz collections and items"
            //});

            //// JWT security example (optional)
            //c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            //{
            //    In = ParameterLocation.Header,
            //    Description = "JWT Authorization header using the Bearer scheme.",
            //    Name = "Authorization",
            //    Type = SecuritySchemeType.ApiKey
            //});

            //c.AddSecurityRequirement(new OpenApiSecurityRequirement
            //{
            //    {
            //        new OpenApiSecurityScheme
            //        {
            //            Reference = new OpenApiReference
            //            {
            //                Type = ReferenceType.SecurityScheme,
            //                Id = "Bearer"
            //            }
            //        },
            //        Array.Empty<string>()
            //    }
            //});
        //});

        return builder;
    }
}
