using Serilog.Core;
using Serilog.Events;

namespace Quizymode.Api.Shared.Configuration;

/// <summary>
/// Backstop for log events: any property whose name looks like a secret (ApiKey, Password, Token, ...) is replaced
/// by <c>***</c>, and destructured objects get the same treatment for their members. <see cref="SecretString"/>
/// masks itself; this covers plain strings.
/// </summary>
internal sealed class SecretLogRedactor : ILogEventEnricher, IDestructuringPolicy
{
    public static readonly SecretLogRedactor Instance = new();

    private static readonly ScalarValue Masked = new(SecretString.Mask);

    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        foreach (KeyValuePair<string, LogEventPropertyValue> property in logEvent.Properties.ToArray())
        {
            if (SecretNames.IsSecretName(property.Key))
            {
                logEvent.AddOrUpdateProperty(new LogEventProperty(property.Key, Masked));
            }
            else if (property.Value is StructureValue structure && Redact(structure) is { } redacted)
            {
                logEvent.AddOrUpdateProperty(new LogEventProperty(property.Key, redacted));
            }
        }
    }

    public bool TryDestructure(object value, ILogEventPropertyValueFactory propertyValueFactory, out LogEventPropertyValue result)
    {
        result = null!;
        if (value is SecretString)
        {
            result = Masked;
            return true;
        }

        return false;
    }

    private static StructureValue? Redact(StructureValue structure)
    {
        bool changed = false;
        List<LogEventProperty> members = new(structure.Properties.Count);
        foreach (LogEventProperty member in structure.Properties)
        {
            if (SecretNames.IsSecretName(member.Name))
            {
                members.Add(new LogEventProperty(member.Name, Masked));
                changed = true;
            }
            else if (member.Value is StructureValue inner && Redact(inner) is { } redactedInner)
            {
                members.Add(new LogEventProperty(member.Name, redactedInner));
                changed = true;
            }
            else
            {
                members.Add(member);
            }
        }

        return changed ? new StructureValue(members, structure.TypeTag) : null;
    }
}
