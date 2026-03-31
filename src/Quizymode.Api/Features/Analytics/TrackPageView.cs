using Quizymode.Api.Data;
using Quizymode.Api.Shared.Http;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Features.Analytics;

public static class TrackPageView
{
    public sealed record Request(string Path, string? QueryString, string SessionId);

    public sealed record Response(string Id, DateTime CreatedUtc);

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("analytics/page-views", Handler)
                .WithTags("Analytics")
                .WithSummary("Track a SPA page view")
                .WithDescription("Stores a page-view event for an anonymous or authenticated SPA route hit.")
                .AllowAnonymous()
                .Produces<Response>(StatusCodes.Status201Created)
                .ProducesProblem(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            HttpContext httpContext,
            ApplicationDbContext db,
            IUserContext userContext,
            CancellationToken cancellationToken)
        {
            Result<Response> result = await HandleAsync(request, httpContext, db, userContext, cancellationToken);

            return result.Match(
                value => Results.Created($"/analytics/page-views/{value.Id}", value),
                error => CustomResults.Problem(result));
        }
    }

    public static async Task<Result<Response>> HandleAsync(
        Request request,
        HttpContext httpContext,
        ApplicationDbContext db,
        IUserContext userContext,
        CancellationToken cancellationToken)
    {
        string normalizedPath = NormalizePath(request.Path);
        if (string.IsNullOrWhiteSpace(normalizedPath) || !normalizedPath.StartsWith("/", StringComparison.Ordinal))
        {
            return Result.Failure<Response>(
                Error.Validation("Analytics.InvalidPath", "Path must be a non-empty app-relative URL path that starts with '/'."));
        }

        string normalizedSessionId = request.SessionId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedSessionId))
        {
            return Result.Failure<Response>(
                Error.Validation("Analytics.InvalidSessionId", "SessionId is required."));
        }

        if (normalizedPath.Length > 2048)
        {
            return Result.Failure<Response>(
                Error.Validation("Analytics.PathTooLong", "Path must be 2048 characters or fewer."));
        }

        if (normalizedSessionId.Length > 128)
        {
            return Result.Failure<Response>(
                Error.Validation("Analytics.SessionIdTooLong", "SessionId must be 128 characters or fewer."));
        }

        string normalizedQueryString = NormalizeQueryString(request.QueryString);
        if (normalizedQueryString.Length > 2048)
        {
            return Result.Failure<Response>(
                Error.Validation("Analytics.QueryStringTooLong", "QueryString must be 2048 characters or fewer."));
        }

        string url = $"{normalizedPath}{normalizedQueryString}";
        if (url.Length > 4096)
        {
            return Result.Failure<Response>(
                Error.Validation("Analytics.UrlTooLong", "The combined URL must be 4096 characters or fewer."));
        }

        Guid? userId = null;
        if (Guid.TryParse(userContext.UserId, out Guid parsedUserId))
        {
            userId = parsedUserId;
        }

        PageView pageView = new()
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            IsAuthenticated = userContext.IsAuthenticated,
            SessionId = normalizedSessionId,
            IpAddress = RequestMetadataHelper.GetClientIpAddress(httpContext),
            Path = normalizedPath,
            QueryString = normalizedQueryString,
            Url = url,
            CreatedUtc = DateTime.UtcNow
        };

        db.PageViews.Add(pageView);
        await db.SaveChangesAsync(CancellationToken.None);

        return Result.Success(new Response(pageView.Id.ToString(), pageView.CreatedUtc));
    }

    private static string NormalizePath(string? path)
    {
        return (path ?? string.Empty).Trim();
    }

    private static string NormalizeQueryString(string? queryString)
    {
        string value = (queryString ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.StartsWith("?", StringComparison.Ordinal) ? value : $"?{value}";
    }
}
