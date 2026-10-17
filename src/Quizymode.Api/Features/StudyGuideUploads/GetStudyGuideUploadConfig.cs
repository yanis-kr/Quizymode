using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideUploads;

/// <summary>GET /study-guide-uploads/config: whether AI generation is available and the input limits.</summary>
public static class GetStudyGuideUploadConfig
{
    public sealed record Response(bool Enabled, int MaxTextBytes, int MaxQuestions);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapGet("study-guide-uploads/config", Handler)
                .WithTags("StudyGuideUploads")
                .WithSummary("Get study guide upload availability and limits")
                .RequireAuthorization()
                .Produces<Response>(StatusCodes.Status200OK);
        }

        private static IResult Handler(IOptions<AnthropicOptions> options) =>
            Results.Ok(Handle(options.Value));
    }

    internal static Response Handle(AnthropicOptions options) =>
        new(options.IsConfigured, StudyGuideUploadText.MaxTextBytes, Math.Clamp(options.MaxQuestions, 1, 20));
}
