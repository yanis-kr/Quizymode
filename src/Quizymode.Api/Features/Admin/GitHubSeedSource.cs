using System.Net.Http.Headers;
using System.Text;
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
            string itemsPath = NormalizeItemsPath(request.ItemsPath, _options.DefaultItemsPath);

            _httpClient.BaseAddress = new Uri(_options.ApiBaseUrl);
            _httpClient.DefaultRequestHeaders.Accept.Clear();
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
            _httpClient.DefaultRequestHeaders.UserAgent.Clear();
            _httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue(_options.UserAgent, "1.0"));
            _httpClient.DefaultRequestHeaders.Remove("X-GitHub-Api-Version");
            _httpClient.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
            ApplyTokenHeader();

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

            Result<List<TreeEntry>> treeResult = await LoadTreeEntriesAsync(
                repositoryOwner,
                repositoryName,
                resolvedCommitSha,
                cancellationToken);

            if (treeResult.IsFailure)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(treeResult.Error!);
            }

            List<TreeEntry> jsonFiles = treeResult.Value!
                .Where(entry => string.Equals(entry.Type, "blob", StringComparison.OrdinalIgnoreCase))
                .Where(entry => entry.Path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                .Where(entry => IsWithinItemsPath(entry.Path, itemsPath))
                .OrderBy(entry => entry.Path, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (jsonFiles.Count == 0)
            {
                return Result.Failure<LoadedGitHubSeedManifest>(
                    Error.Validation(
                        "Admin.SeedSyncItemsPathEmpty",
                        $"No JSON files were found under '{itemsPath}' in {repositoryOwner}/{repositoryName} at ref '{gitRef}'."));
            }

            List<SeedSyncAdmin.SeedItemRequest> items = await LoadItemsFromFilesAsync(jsonFiles, cancellationToken);

            SeedSyncAdmin.ManifestRequest manifest = new(
                SeedSet: itemsPath,
                Items: items,
                DeltaPreviewLimit: request.DeltaPreviewLimit);

            return Result.Success(new LoadedGitHubSeedManifest(
                manifest,
                new SeedSyncAdmin.SourceContext(
                    repositoryOwner,
                    repositoryName,
                    gitRef,
                    resolvedCommitSha,
                    itemsPath,
                    jsonFiles.Count)));
        }
        catch (Exception ex)
        {
            return Result.Failure<LoadedGitHubSeedManifest>(
                Error.Problem("Admin.SeedSyncGitHubFetchFailed", $"Failed to load seed files from GitHub: {ex.Message}"));
        }
    }

    private void ApplyTokenHeader()
    {
        _httpClient.DefaultRequestHeaders.Authorization = null;

        if (!string.IsNullOrWhiteSpace(_options.Token))
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.Token);
        }
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

    private async Task<Result<List<TreeEntry>>> LoadTreeEntriesAsync(
        string repositoryOwner,
        string repositoryName,
        string resolvedCommitSha,
        CancellationToken cancellationToken)
    {
        using HttpResponseMessage response = await _httpClient.GetAsync(
            $"/repos/{repositoryOwner}/{repositoryName}/git/trees/{resolvedCommitSha}?recursive=1",
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            return Result.Failure<List<TreeEntry>>(
                Error.Problem(
                    "Admin.SeedSyncTreeLoadFailed",
                    $"Unable to enumerate seed files from commit '{resolvedCommitSha}': {description}"));
        }

        GitHubTreeResponse? tree = await JsonSerializer.DeserializeAsync<GitHubTreeResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (tree?.Tree is null)
        {
            return Result.Failure<List<TreeEntry>>(
                Error.Problem(
                    "Admin.SeedSyncTreeInvalid",
                    $"GitHub returned an invalid tree payload for commit '{resolvedCommitSha}'."));
        }

        return Result.Success(tree.Tree);
    }

    private async Task<List<SeedSyncAdmin.SeedItemRequest>> LoadItemsFromFilesAsync(
        List<TreeEntry> jsonFiles,
        CancellationToken cancellationToken)
    {
        List<Task<List<SeedSyncAdmin.SeedItemRequest>>> tasks = jsonFiles
            .Select(file => LoadFileItemsAsync(file, cancellationToken))
            .ToList();

        List<SeedSyncAdmin.SeedItemRequest>[] fileItems = await Task.WhenAll(tasks);
        return fileItems.SelectMany(items => items).ToList();
    }

    private async Task<List<SeedSyncAdmin.SeedItemRequest>> LoadFileItemsAsync(
        TreeEntry file,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(file.Url))
        {
            throw new InvalidOperationException($"GitHub tree entry '{file.Path}' did not include a blob URL.");
        }

        using HttpResponseMessage response = await _httpClient.GetAsync(file.Url, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            string description = await BuildErrorDescriptionAsync(response, cancellationToken);
            throw new InvalidOperationException($"Unable to fetch '{file.Path}' from GitHub: {description}");
        }

        GitHubBlobResponse? blob = await JsonSerializer.DeserializeAsync<GitHubBlobResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            JsonOptions,
            cancellationToken);

        if (blob is null || !string.Equals(blob.Encoding, "base64", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"GitHub blob payload for '{file.Path}' was invalid or not base64 encoded.");
        }

        string normalizedBase64 = blob.Content.Replace("\n", string.Empty).Replace("\r", string.Empty);
        string json = Encoding.UTF8.GetString(Convert.FromBase64String(normalizedBase64));

        List<SeedSyncAdmin.SeedItemRequest>? items = JsonSerializer.Deserialize<List<SeedSyncAdmin.SeedItemRequest>>(
            json,
            JsonOptions);

        if (items is null || items.Count == 0)
        {
            throw new InvalidOperationException($"Seed source file '{file.Path}' did not contain any items.");
        }

        return items;
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

    private static string NormalizeItemsPath(string? requestedPath, string defaultItemsPath)
    {
        string candidate = string.IsNullOrWhiteSpace(requestedPath)
            ? defaultItemsPath
            : requestedPath.Trim();

        return candidate.Replace('\\', '/').Trim('/');
    }

    private static bool IsWithinItemsPath(string path, string itemsPath)
    {
        string normalizedPath = path.Replace('\\', '/').Trim('/');

        if (string.Equals(normalizedPath, itemsPath, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return normalizedPath.StartsWith(itemsPath + "/", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record GitHubCommitResponse(string Sha);

    private sealed record GitHubTreeResponse(List<TreeEntry> Tree);

    private sealed record TreeEntry(string Path, string Type, string Url);

    private sealed record GitHubBlobResponse(string Content, string Encoding);
}
