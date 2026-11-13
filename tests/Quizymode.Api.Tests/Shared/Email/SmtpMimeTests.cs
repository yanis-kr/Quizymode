using System.Net.Mail;
using FluentAssertions;
using Quizymode.Api.Shared.Email;
using Xunit;

namespace Quizymode.Api.Tests.Shared.Email;

/// <summary>#573: the digest goes out as multipart/alternative (text/plain, then text/html); plain-only mail stays plain.</summary>
public sealed class SmtpMimeTests
{
    private static string Serialize(MailMessage message)
    {
        string directory = Path.Combine(Path.GetTempPath(), "qm-mime-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            using SmtpClient client = new() { DeliveryMethod = SmtpDeliveryMethod.SpecifiedPickupDirectory, PickupDirectoryLocation = directory };
            client.Send(message);
            return File.ReadAllText(Directory.GetFiles(directory).Single());
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }

    [Fact]
    public void WithHtml_IsMultipartAlternative_PlainTextFirstThenHtml()
    {
        using MailMessage message = SmtpEmailSender.BuildMessage("from@example.test", "to@example.test", "subject", "plain body", "<p>html body</p>");

        string mime = Serialize(message);

        mime.Should().Contain("multipart/alternative");
        int plain = mime.IndexOf("text/plain", StringComparison.OrdinalIgnoreCase);
        int html = mime.IndexOf("text/html", StringComparison.OrdinalIgnoreCase);
        plain.Should().BeGreaterThan(0);
        html.Should().BeGreaterThan(plain);
    }

    [Fact]
    public void WithoutHtml_StaysSinglePartPlainText()
    {
        using MailMessage message = SmtpEmailSender.BuildMessage("from@example.test", "to@example.test", "subject", "plain body", null);

        string mime = Serialize(message);

        mime.Should().NotContain("multipart/alternative");
        mime.Should().NotContain("text/html");
        message.AlternateViews.Should().BeEmpty();
    }
}
