using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.Admin;

internal sealed class GitHubSeedSource(
    HttpClient httpClient,
    IOptions<GitHubSeedSyncOptions> options) : IGitHubSeedSource
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient = httpClient;
    private readonly GitHubSeedSyncOptions _options = options.Value;

    public async Task<Result<LoadedGitHubSeedManifest>> LoadManifestAsync(
        SeedSyncAdmin.Request request,
        CancellationToken cancellationToken)
    {
        try
        {
            string repositoryOwner = request.RepositoryOwner.Trim();
            string repositoryName = request.RepositoryName.Trim();
            string gitRef = request.GitRef.Trim();
            string bundlePath = _options.BundlePath;
            string collectionsPath = _options.CollectionsPath;

            ConfigureApiHeaders();

            Result<string> commitShaResult = await ResolveCommitShaAsync(
                repositoryOwner,
                repositoryName,
                gitRef,
                cancellationToken);

            if (commitShaResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(commitShaResult.Error!);
            }

            string resolvedCommitSha = commitShaResult.Value!;

            Result<List<SeedSyncAdmin.SeedItemRequest>> bundleResult = await LoadBundleAsync(
                repositoryOwner,
                repositoryName,
                resolvedCommitSha,
                bundlePath,
                cancellationToken);

            if (bundleResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(bundleResult.Error!);
            }

            List<SeedSyncAdmin.SeedItemRequest> items = bundleResult.Value!;
            Result<(List<SeedSyncAdmin.SeedCollectionRequest> Collections, int SourceFileCount)> collectionsResult =
                await LoadCollectionsAsync(
                    repositoryOwner,
                    repositoryName,
                    resolvedCommitSha,
                    collectionsPath,
                    cancellationToken);

            if (collectionsResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(collectionsResult.Error!);
            }

            SeedSyncAdmin.ManifestRequest manifest = new(
                SeedSet: bundlePath,
                Items: items,
                Collections: collectionsResult.Value!.Collections,
                DeltaPreviewLimit: request.DeltaPreviewLimit);

            return Result.Success(new LoadedGitHubSeedManifest(
                manifest,
                new SeedSyncAdmin.SourceContext(
                    repositoryOwner,
                    repositoryName,
                    gitRef,
                    resolvedCommitSha,
                    bundlePath,
                    SourceFileCount: 1,
                    CollectionsPath: collectionsPath,
                    CollectionSourceFileCount: collectionsResult.Value.SourceFileCount)));
        }
        catch (Exception ex)
        {
            return Result.Failure<LoadedGitHubSeedManifest>(
                Error.Problem("Admin.SeedSyncGitHubFetchFailed", $"Failed to load items bundle from GitHub: {ex.Message}"));
        }
    }

    private void ConfigureApiHeaders()
    {
        _httpClient.BaseAddress = new Uri(_options.ApiBaseUrl);
        _httpClient.DefaultRequestHeaders.Accept.Clear();
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        _httpClient.DefaultRequestHeaders.UserAgent.Clear();
        _httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue(_options.UserAgent, "1.0"));
        _httpClient.DefaultRequestHeaders.Remove("X-GitHub-Api-Version");
        _httpClient.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");

        _httpClient.DefaultRequestHeaders.Authorization = string.IsNullOrWhiteSpace(_options.Token)
            ? null
            : new AuthenticationHeaderValue("Bearer", _options.Token);
    }

    private async Task<Result<string>> ResolveCommitShaAsync(
        string repositoryOwner,
        string repositoryName,
        string gitRef,
        CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await _httpClient.GetAsync(
            $"/repos/{repositoryOwner}/{repositoryName}/commits/{Uri.EscapeDataString(gitRef)}",
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<string>(
                Error.Validation(
                    "Admin.SeedSyncGitRefNotFound",
                    $"Unable to resolve git ref '{gitRef}' in {repositoryOwner}/{repositoryName}: {description}"));
        }

        GitHubCommitResponse? commit = await JsonSerializer.DeserializeAsync<GitHubCommitResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (commit is null || string.IsNullOrWhiteSpace(commit.Sha))
        {
            return Result.Failure<string>(
                Error.Problem(
                    "Admin.SeedSyncGitRefResolveFailed",
                    $"GitHub did not return a commit SHA for ref '{gitRef}' in {repositoryOwner}/{repositoryName}."));
        }

        return Result.Success(commit.Sha);
    }

    private async Task<Result<List<SeedSyncAdmin.SeedItemRequest>>> LoadBundleAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        string bundlePath,
        CancellationToken cancellationToken)
    {
        string rawUrl = $"{_options.RawBaseUrl.TrimEnd('/')}/{repositoryOwner}/{repositoryName}/{resolvedCommitSha}/{bundlePath}";

        using HttpResponseMessage response = await _httpClient.GetAsync(rawUrl, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<List<SeedSyncAdmin.SeedItemRequest>>(
                Error.Problem(
                    "Admin.SeedSyncBundleFetchFailed",
                    $"Unable to fetch items bundle '{bundlePath}' at '{resolvedCommitSha}': {description}"));
        }

        List<SeedSyncAdmin.SeedItemRequest>? items = await JsonSerializer.DeserializeAsync<List<SeedSyncAdmin.SeedItemRequest>>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (items is null || items.Count == 0)
        {
            return Result.Failure<List<SeedSyncAdmin.SeedItemRequest>>(
                Error.Problem(
                    "Admin.SeedSyncBundleEmpty",
                    $"Items bundle '{bundlePath}' did not contain any items."));
        }

        return Result.Success(items);
    }

    private async Task<Result<(List<SeedSyncAdmin.SeedCollectionRequest> Collections, int SourceFileCount)>> LoadCollectionsAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        string collectionsPath,
        CancellationToken cancellationToken)
    {
        Result<List<string>> pathsResult = await ListCollectionPathsAsync(
            repositoryOwner,
            repositoryName,
            resolvedCommitSha,
            collectionsPath,
            cancellationToken);

        if (pathsResult.IsFailure)
        {
            return Result.Failure<(List<SeedSyncAdmin.SeedCollectionRequest> Collections, int SourceFileCount)>(pathsResult.Error!);
        }

        List<string> collectionPaths = pathsResult.Value!;
        List<SeedSyncAdmin.SeedCollectionRequest> collections = [];

        foreach (string collectionPath in collectionPaths)
        {
            string rawUrl = $"{_options.RawBaseUrl.TrimEnd('/')}/{repositoryOwner}/{repositoryName}/{resolvedCommitSha}/{collectionPath}";
            using HttpResponseMessage response = await _httpClient.GetAsync(rawUrl, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                string description = await BuildErrorDescriptionAsync(response, cancellationToken);
                return Result.Failure<(List<SeedSyncAdmin.SeedCollectionRequest> Collections, int SourceFileCount)>(
                    Error.Problem(
                        "Admin.SeedSyncCollectionsFetchFailed",
                        $"Unable to fetch collection seed '{collectionPath}' at '{resolvedCommitSha}': {description}"));
            }

            SeedSyncAdmin.SeedCollectionRequest? collection =
                await JsonSerializer.DeserializeAsync<SeedSyncAdmin.SeedCollectionRequest>(
                    await response.Content.ReadAsStreamAsync(cancellationToken),
                    JsonOptions,
                    cancellationToken);

            if (collection is null)
            {
                return Result.Failure<(List<SeedSyncAdmin.SeedCollectionRequest> Collections, int SourceFileCount)>(
                    Error.Problem(
                        "Admin.SeedSyncCollectionEmpty",
                        $"Collection seed '{collectionPath}' was empty or invalid."));
            }

            collections.Add(collection);
        }

        return Result.Success((collections, collectionPaths.Count));
    }

    private async Task<Result<List<string>>> ListCollectionPathsAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        string collectionsPath,
        CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await _httpClient.GetAsync(
            $"/repos/{repositoryOwner}/{repositoryName}/git/trees/{resolvedCommitSha}?recursive=1",
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<List<string>>(
                Error.Problem(
                    "Admin.SeedSyncCollectionsListFailed",
                    $"Unable to list collection seeds under '{collectionsPath}' at '{resolvedCommitSha}': {description}"));
        }

        GitHubTreeResponse? treeResponse = await JsonSerializer.DeserializeAsync<GitHubTreeResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (treeResponse?.Tree is null)
        {
            return Result.Failure<List<string>>(
                Error.Problem(
                    "Admin.SeedSyncCollectionsListFailed",
                    $"GitHub did not return a tree for '{resolvedCommitSha}'."));
        }

        string normalizedPrefix = collectionsPath.Trim('/').Replace('\\', '/') + "/";
        List<string> paths = treeResponse.Tree
            .Where(entry => string.Equals(entry.Type, "blob", StringComparison.OrdinalIgnoreCase))
            .Select(entry => entry.Path)
            .Where(path => path.StartsWith(normalizedPrefix, StringComparison.OrdinalIgnoreCase))
            .Where(path => path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Result.Success(paths);
    }

    private static async Task<string> BuildErrorDescriptionAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        string body = await response.Content.ReadAsStringAsync(cancellationToken);
        string trimmed = body.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return $"{(int)response.StatusCode} {response.ReasonPhrase}";
        }

        return $"{(int)response.StatusCode} {response.ReasonPhrase}: {trimmed}";
    }

    private sealed record GitHubCommitResponse(string Sha);

    private sealed record GitHubTreeResponse(List<GitHubTreeEntry> Tree);

    private sealed record GitHubTreeEntry(string Path, string Type);
}
