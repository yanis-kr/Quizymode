using System.Text.Json;
using System.Text.Json.Serialization;

namespace Quizymode.Api.Shared.Configuration;

/// <summary>
/// Wraps a secret so it cannot be logged or serialized by accident: <see cref="ToString"/>, JSON output and Serilog
/// destructuring all give <c>***</c>. The raw value is available only through <see cref="Reveal"/>.
/// </summary>
[JsonConverter(typeof(SecretStringJsonConverter))]
internal sealed class SecretString(string? value)
{
    internal const string Mask = "***";

    private readonly string _value = value ?? string.Empty;

    public bool IsEmpty => _value.Length == 0;

    public string Reveal() => _value;

    public override string ToString() => Mask;

    public static implicit operator SecretString(string? value) => new(value);
}

internal sealed class SecretStringJsonConverter : JsonConverter<SecretString>
{
    public override SecretString Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        new(reader.GetString());

    public override void Write(Utf8JsonWriter writer, SecretString value, JsonSerializerOptions options) =>
        writer.WriteStringValue(SecretString.Mask);
}
