namespace Quizymode.Api.Services;

/// <summary>Display names are shown to other users, so an email address must not become one (AC 4.1.10).</summary>
internal static class DisplayNameRules
{
    internal const string AtSignMessage = "Name cannot contain @";

    internal static bool LooksLikeEmail(string value) => value.Contains('@');
}
