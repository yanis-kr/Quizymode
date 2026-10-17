#:sdk Microsoft.NET.Sdk.Web
#:property PublishAot=false
#:property JsonSerializerIsReflectionEnabledByDefault=true
// Local test identity provider standing in for Cognito during evidence runs. It serves OIDC
// discovery and a JWKS for a throwaway RSA key and mints Cognito-shaped tokens for a fake client.
// The API trusts it only because the local run points Authentication:Cognito:Authority here.
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string Issuer = "https://localhost:7443";
const string ClientId = "quizymode-local-evidence";
const string KeyId = "local-evidence-key";

using RSA rsa = RSA.Create(2048);
RSAParameters publicParameters = rsa.ExportParameters(false);

static string B64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

string Sign(Dictionary<string, object> payload)
{
    string header = B64Url(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object> { ["alg"] = "RS256", ["typ"] = "JWT", ["kid"] = KeyId }));
    string body = B64Url(JsonSerializer.SerializeToUtf8Bytes(payload));
    byte[] signature = rsa.SignData(Encoding.ASCII.GetBytes($"{header}.{body}"), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    return $"{header}.{body}.{B64Url(signature)}";
}

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Issuer);
WebApplication app = builder.Build();

app.MapGet("/.well-known/openid-configuration", () => Results.Json(new Dictionary<string, object>
{
    ["issuer"] = Issuer,
    ["jwks_uri"] = $"{Issuer}/jwks",
    ["authorization_endpoint"] = $"{Issuer}/authorize",
    ["token_endpoint"] = $"{Issuer}/token",
    ["response_types_supported"] = new[] { "code" },
    ["subject_types_supported"] = new[] { "public" },
    ["id_token_signing_alg_values_supported"] = new[] { "RS256" }
}));

app.MapGet("/jwks", () => Results.Json(new
{
    keys = new[]
    {
        new { kty = "RSA", use = "sig", alg = "RS256", kid = KeyId, n = B64Url(publicParameters.Modulus!), e = B64Url(publicParameters.Exponent!) }
    }
}));

// /mint?sub=...&email=...&groups=Admins  ->  { idToken, accessToken, expiresUtc }
app.MapGet("/mint", (string sub, string email, string? groups, int? minutes) =>
{
    long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    long exp = now + 60L * (minutes ?? 240);
    string[] groupList = string.IsNullOrWhiteSpace(groups) ? [] : groups.Split(',', StringSplitOptions.RemoveEmptyEntries);

    Dictionary<string, object> id = new()
    {
        ["sub"] = sub, ["email"] = email, ["email_verified"] = true, ["cognito:username"] = sub,
        ["aud"] = ClientId, ["iss"] = Issuer, ["token_use"] = "id", ["auth_time"] = now, ["iat"] = now, ["exp"] = exp
    };
    Dictionary<string, object> access = new()
    {
        ["sub"] = sub, ["client_id"] = ClientId, ["username"] = sub, ["iss"] = Issuer, ["token_use"] = "access",
        ["scope"] = "aws.cognito.signin.user.admin", ["auth_time"] = now, ["iat"] = now, ["exp"] = exp
    };
    if (groupList.Length > 0)
    {
        id["cognito:groups"] = groupList;
        access["cognito:groups"] = groupList;
    }

    return Results.Json(new { idToken = Sign(id), accessToken = Sign(access), expiresUtc = DateTimeOffset.FromUnixTimeSeconds(exp) });
});

app.Run();
