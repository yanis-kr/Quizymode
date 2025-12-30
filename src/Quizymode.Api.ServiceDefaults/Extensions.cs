using System;
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Instrumentation.EntityFrameworkCore;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

// Adds common .NET Aspire services: service discovery, resilience, health checks, and OpenTelemetry.
// This project should be referenced by each service project in your solution.
// To learn more about using this project, see https://aka.ms/dotnet/aspire/service-defaults
public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            // Turn on resilience by default
            http.AddStandardResilienceHandler();

            // Turn on service discovery by default
            http.AddServiceDiscovery();
        });

        // Uncomment the following to restrict the allowed schemes for service discovery.
        // builder.Services.Configure<ServiceDiscoveryOptions>(options =>
        // {
        //     options.AllowedSchemes = ["https"];
        // });

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        var openTelemetryBuilder = builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(builder.Environment.ApplicationName)
                    .AddAspNetCoreInstrumentation(tracing =>
                        // Exclude health check requests from tracing
                        tracing.Filter = context =>
                            !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                            && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath)
                    )
                    // Uncomment the following line to enable gRPC instrumentation (requires the OpenTelemetry.Instrumentation.GrpcNetClient package)
                    //.AddGrpcClientInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation(options =>
                    {
                        // Instrument EF Core database operations
                        options.SetDbStatementForText = true;
                        options.EnrichWithIDbCommand = (activity, command) =>
                        {
                            activity.SetTag("db.system", "postgresql");
                        };
                    });
            });

        // Configure exporters (OTLP for Grafana Cloud or Aspire)
        builder.AddOpenTelemetryExporters(openTelemetryBuilder);

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder, OpenTelemetry.OpenTelemetryBuilder openTelemetryBuilder) where TBuilder : IHostApplicationBuilder
    {
        // Check if Grafana Cloud is explicitly configured
        var grafanaCloudEnabled = builder.Configuration.GetValue<bool>("GrafanaCloud:Enabled", false);
        var grafanaCloudOtlpEndpoint = builder.Configuration["GrafanaCloud:OtlpEndpoint"];
        
        // If Grafana Cloud is enabled, use it (even if Aspire is running)
        // Otherwise, check for OTLP endpoint via environment variable (for Aspire)
        string? otlpEndpoint = null;
        
        if (grafanaCloudEnabled && !string.IsNullOrWhiteSpace(grafanaCloudOtlpEndpoint))
        {
            // Grafana Cloud is explicitly configured - use it
            otlpEndpoint = grafanaCloudOtlpEndpoint;
        }
        else
        {
            // Fall back to Aspire's OTLP endpoint if available
            otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
        }

        if (!string.IsNullOrWhiteSpace(otlpEndpoint))
        {
            // Configure OTLP exporter with optional Grafana Cloud authentication
            // Support separate OTLP instance ID/API key, with fallback to legacy InstanceId/ApiKey
            var otlpInstanceId = builder.Configuration["GrafanaCloud:OtlpInstanceId"] 
                ?? builder.Configuration["GrafanaCloud:InstanceId"] ?? string.Empty;
            var otlpApiKey = builder.Configuration["GrafanaCloud:OtlpApiKey"] 
                ?? builder.Configuration["GrafanaCloud:ApiKey"] ?? string.Empty;
            
            // Use environment variable headers if provided, otherwise construct from Grafana Cloud config
            var otlpHeaders = builder.Configuration["OTEL_EXPORTER_OTLP_HEADERS"];
            
            // Only construct Grafana Cloud auth headers if Grafana Cloud is enabled
            if (grafanaCloudEnabled && 
                string.IsNullOrWhiteSpace(otlpHeaders) && 
                !string.IsNullOrWhiteSpace(otlpInstanceId) && 
                !string.IsNullOrWhiteSpace(otlpApiKey))
            {
                // Construct Basic auth header for Grafana Cloud: base64(instanceId:apiKey)
                var credentials = System.Text.Encoding.UTF8.GetBytes($"{otlpInstanceId}:{otlpApiKey}");
                var base64Credentials = Convert.ToBase64String(credentials);
                otlpHeaders = $"Authorization=Basic {base64Credentials}";
            }

            // Set environment variables for OTLP exporter (it reads from these automatically)
            Environment.SetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT", otlpEndpoint);
            
            if (!string.IsNullOrWhiteSpace(otlpHeaders))
            {
                Environment.SetEnvironmentVariable("OTEL_EXPORTER_OTLP_HEADERS", otlpHeaders);
            }
            
            // Chain UseOtlpExporter to the existing OpenTelemetry builder
            openTelemetryBuilder.UseOtlpExporter();
        }

        // Uncomment the following lines to enable the Azure Monitor exporter (requires the Azure.Monitor.OpenTelemetry.AspNetCore package)
        //if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
        //{
        //    builder.Services.AddOpenTelemetry()
        //       .UseAzureMonitor();
        //}

        return builder;
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            // Add a default liveness check to ensure app is responsive
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // Adding health checks endpoints to applications in non-development environments has security implications.
        // See https://aka.ms/dotnet/aspire/healthchecks for details before enabling these endpoints in non-development environments.
        if (app.Environment.IsDevelopment())
        {
            // All health checks must pass for app to be considered ready to accept traffic after starting
            app.MapHealthChecks(HealthEndpointPath);

            // Only health checks tagged with the "live" tag must pass for app to be considered alive
            app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });
        }

        return app;
    }
}
