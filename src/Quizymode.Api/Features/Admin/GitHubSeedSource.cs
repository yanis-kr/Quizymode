using System.Net;
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
            string owner = request.RepositoryOwner.Trim();
            string repo = request.RepositoryName.Trim();
            string gitRef = request.GitRef.Trim();

            if (!string.Equals(owner, _options.AllowedRepositoryOwner, StringComparison.OrdinalIgnoreCase)
                || !string.Equals(repo, _options.AllowedRepositoryName, StringComparison.OrdinalIgnoreCase))
            {
                return Result.Failure<LoadedGitHubSeedManifest>(
                    Error.Validation(
                        "Admin.SeedSyncRepositoryNotAllowed",
                        $"Seed sync reads only from {_options.AllowedRepositoryOwner}/{_options.AllowedRepositoryName}."));
            }

            // The configured spelling, so the repository part of every URL comes from configuration.
            owner = _options.AllowedRepositoryOwner;
            repo = _options.AllowedRepositoryName;

            ConfigureApiHeaders();

            Result<string> commitShaResult = await ResolveCommitShaAsync(owner, repo, gitRef, cancellationToken);
            if (commitShaResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(commitShaResult.Error!);
            }

            string resolvedSha = commitShaResult.Value!;

            Result<SourceFileIndex> indexResult = await LoadSourceFileIndexAsync(
                owner, repo, resolvedSha, _options.SourceFileIndexPath, cancellationToken);
            if (indexResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(indexResult.Error!);
            }

            SourceFileIndex index = indexResult.Value!;
            List<SourceFileEntry> filesToProcess;
            int totalFilteredFiles;
            int nextFileOffset;
            bool isIncrementalSync = !string.IsNullOrWhiteSpace(request.SinceCommitSha);

            if (isIncrementalSync)
            {
                Result<HashSet<string>> changedFilesResult = await GetChangedSourceFilesAsync(
                    owner, repo, request.SinceCommitSha!.Trim(), resolvedSha, cancellationToken);
                if (changedFilesResult.IsFailure)
                {
                    return Result.Failure<LoadedGitHubSeedManifest>(changedFilesResult.Error!);
                }

                HashSet<string> changedFiles = changedFilesResult.Value!;
                filesToProcess = index.Files
                    .Where(f => changedFiles.Contains(f.Path))
                    .ToList();
                totalFilteredFiles = filesToProcess.Count;
                nextFileOffset = 0;
            }
            else
            {
                totalFilteredFiles = index.Files.Count;
                filesToProcess = index.Files
                    .Skip(request.FileOffset)
                    .Take(request.FileBatchSize)
                    .ToList();
                nextFileOffset = request.FileOffset + filesToProcess.Count;
            }

            bool isComplete = isIncrementalSync || nextFileOffset >= totalFilteredFiles;

            List<SeedSyncAdmin.SeedItemRequest> items = [];
            foreach (SourceFileEntry file in filesToProcess)
            {
                Result<List<SeedSyncAdmin.SeedItemRequest>> fileResult = await LoadSourceFileItemsAsync(
                    owner, repo, resolvedSha, file.Path, cancellationToken);
                if (fileResult.IsFailure)
                {
                    return Result.Failure<LoadedGitHubSeedManifest>(fileResult.Error!);
                }

                items.AddRange(fileResult.Value!);
            }

            Result<(List<SeedSyncAdmin.SeedCollectionRequest> Collections, int SourceFileCount)> collectionsResult =
                await LoadCollectionsAsync(owner, repo, resolvedSha, _options.CollectionsPath, cancellationToken);
            if (collectionsResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(collectionsResult.Error!);
            }

            SeedSyncAdmin.ManifestRequest manifest = new(
                SeedSet: _options.SourceFileIndexPath,
                Items: items,
                Collections: collectionsResult.Value!.Collections,
                DeltaPreviewLimit: request.DeltaPreviewLimit);

            SeedSyncAdmin.SourceContext sourceContext = new(
                RepositoryOwner: owner,
                RepositoryName: repo,
                GitRef: gitRef,
                ResolvedCommitSha: resolvedSha,
                ItemsPath: _options.SourceFileIndexPath,
                SourceFileCount: filesToProcess.Count,
                CollectionsPath: _options.CollectionsPath,
                CollectionSourceFileCount: collectionsResult.Value.SourceFileCount,
                TotalFiles: totalFilteredFiles,
                ProcessedFiles: filesToProcess.Count,
                NextFileOffset: isComplete ? 0 : nextFileOffset,
                IsComplete: isComplete);

            Result<string?> taxonomyResult = await FetchOptionalRawFileAsync(
                owner, repo, resolvedSha, _options.TaxonomyYamlPath, cancellationToken);
            if (taxonomyResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(taxonomyResult.Error!);
            }

            return Result.Success(new LoadedGitHubSeedManifest(manifest, sourceContext, taxonomyResult.Value));
        }
        catch (Exception ex)
        {
            return Result.Failure<LoadedGitHubSeedManifest>(
                Error.Problem("Admin.SeedSyncGitHubFetchFailed", "Failed to load items from GitHub.", ex));
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

    private async Task<Result<SourceFileIndex>> LoadSourceFileIndexAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        string indexPath,
        CancellationToken cancellationToken)
    {
        Uri rawUrl = BuildRawUrl(repositoryOwner, repositoryName, resolvedCommitSha, indexPath);
        using HttpResponseMessage response = await _httpClient.GetAsync(rawUrl, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<SourceFileIndex>(
                Error.Problem(
                    "Admin.SeedSyncSourceFileIndexFetchFailed",
                    $"Unable to fetch source file index '{indexPath}' at '{resolvedCommitSha}': {description}"));
        }

        SourceFileIndex? index = await JsonSerializer.DeserializeAsync<SourceFileIndex>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (index is null || index.Files.Count == 0)
        {
            return Result.Failure<SourceFileIndex>(
                Error.Problem(
                    "Admin.SeedSyncSourceFileIndexEmpty",
                    $"Source file index '{indexPath}' contained no files."));
        }

        SourceFileEntry? outside = index.Files.FirstOrDefault(file => !IsAllowedSourcePath(file.Path));
        if (outside is not null)
        {
            return Result.Failure<SourceFileIndex>(
                Error.Validation(
                    "Admin.SeedSyncSourceFilePathNotAllowed",
                    $"Source file index '{indexPath}' lists a path outside '{_options.SourceFilesRoot}': '{outside.Path}'."));
        }

        return Result.Success(index);
    }

    /// <summary>
    /// The URL of one file at the resolved commit. <see cref="Uri"/> collapses <c>..</c> segments, percent-encoded ones
    /// too, so the result is checked to still lie under that repository and commit.
    /// </summary>
    private Uri BuildRawUrl(string repositoryOwner, string repositoryName, string resolvedCommitSha, string filePath)
    {
        string root = $"{_options.RawBaseUrl.TrimEnd('/')}/{repositoryOwner}/{repositoryName}/{resolvedCommitSha}/";
        Uri url = new(root + filePath);
        if (!url.AbsolutePath.StartsWith(new Uri(root).AbsolutePath, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Source path '{filePath}' leaves the repository at the resolved commit.");
        }

        return url;
    }

    /// <summary>
    /// Paths named by the source (the index and the collection tree) must stay under the seed directory.
    /// </summary>
    private bool IsAllowedSourcePath(string? path) =>
        path is not null
        && path.StartsWith(_options.SourceFilesRoot, StringComparison.Ordinal)
        && path.IndexOfAny(['\\', '%', '?', '#']) < 0
        && !path.Split('/').Any(segment => segment.Trim() is "." or "..");

    private async Task<Result<HashSet<string>>> GetChangedSourceFilesAsync(
        string repositoryOwner,
        string repositoryName,
        string sinceCommitSha,
        string headCommitSha,
        CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await _httpClient.GetAsync(
            $"/repos/{repositoryOwner}/{repositoryName}/compare/{sinceCommitSha}...{headCommitSha}",
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<HashSet<string>>(
                Error.Problem(
                    "Admin.SeedSyncCompareFailed",
                    $"Unable to compare '{sinceCommitSha}' and '{headCommitSha}' in {repositoryOwner}/{repositoryName}: {description}"));
        }

        GitHubCompareResponse? compare = await JsonSerializer.DeserializeAsync<GitHubCompareResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        HashSet<string> changedFiles = compare?.Files is null
            ? []
            : compare.Files
                .Select(f => f.Filename)
                .Where(f => !string.IsNullOrEmpty(f))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return Result.Success(changedFiles);
    }

    private async Task<Result<List<SeedSyncAdmin.SeedItemRequest>>> LoadSourceFileItemsAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        string filePath,
        CancellationToken cancellationToken)
    {
        Uri rawUrl = BuildRawUrl(repositoryOwner, repositoryName, resolvedCommitSha, filePath);
        using HttpResponseMessage response = await _httpClient.GetAsync(rawUrl, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<List<SeedSyncAdmin.SeedItemRequest>>(
                Error.Problem(
                    "Admin.SeedSyncSourceFileFetchFailed",
                    $"Unable to fetch source file '{filePath}' at '{resolvedCommitSha}': {description}"));
        }

        List<SeedSyncAdmin.SeedItemRequest>? items = await JsonSerializer.DeserializeAsync<List<SeedSyncAdmin.SeedItemRequest>>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (items is null)
        {
            return Result.Failure<List<SeedSyncAdmin.SeedItemRequest>>(
                Error.Problem(
                    "Admin.SeedSyncSourceFileEmpty",
                    $"Source file '{filePath}' was empty or invalid."));
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
            Uri rawUrl = BuildRawUrl(repositoryOwner, repositoryName, resolvedCommitSha, collectionPath);
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

        string? outside = paths.FirstOrDefault(path => !IsAllowedSourcePath(path));
        if (outside is not null)
        {
            return Result.Failure<List<string>>(
                Error.Validation(
                    "Admin.SeedSyncSourceFilePathNotAllowed",
                    $"The collection tree lists a path outside '{_options.SourceFilesRoot}': '{outside}'."));
        }

        return Result.Success(paths);
    }

    /// <summary>Null when the commit has no such file. Any other failure fails the sync rather than skipping the file.</summary>
    private async Task<Result<string?>> FetchOptionalRawFileAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        string filePath,
        CancellationToken cancellationToken)
    {
        Uri rawUrl = BuildRawUrl(repositoryOwner, repositoryName, resolvedCommitSha, filePath);
        using HttpResponseMessage response = await _httpClient.GetAsync(rawUrl, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return Result.Success<string?>(null);
        }

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<string?>(
                Error.Problem(
                    "Admin.SeedSyncTaxonomyFetchFailed",
                    $"Unable to fetch '{filePath}' at '{resolvedCommitSha}': {description}"));
        }

        return Result.Success<string?>(await response.Content.ReadAsStringAsync(cancellationToken));
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

    private sealed record SourceFileIndex(int TotalItems, List<SourceFileEntry> Files);

    private sealed record SourceFileEntry(
        string Path,
        string Category,
        string Nav1,
        string Nav2,
        int ItemCount,
        string? ModifiedAt);

    private sealed record GitHubCompareResponse(List<GitHubCompareFile>? Files);

    private sealed record GitHubCompareFile(string Filename);

    private sealed record GitHubTreeResponse(List<GitHubTreeEntry> Tree);

    private sealed record GitHubTreeEntry(string Path, string Type);
}
