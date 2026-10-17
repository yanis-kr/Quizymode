#:package PdfPig@0.1.16
#:package DocumentFormat.OpenXml@3.5.1
// Builds evidence upload files: a 14-page selectable-text PDF (repeated header + page numbers), a mostly-empty
// "scanned-like" PDF, a PNG renamed .pdf, and a small DOCX with headings.
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

string outDir = args[0];
Directory.CreateDirectory(outDir);

string[] topics = ["Photosynthesis", "Cell structure", "Ecosystems", "Genetics", "Evolution", "Human digestion", "Plate tectonics",
    "The water cycle", "Atoms and elements", "Chemical bonds", "Forces and motion", "Energy transfer", "Waves and sound", "Electricity"];

static string Para(string topic, int n) =>
    $"{topic} is covered in part {n} of this guide. Students should remember that {topic.ToLowerInvariant()} depends on several linked processes. " +
    $"The first key idea about {topic.ToLowerInvariant()} is that every living or physical system keeps a balance between inputs and outputs. " +
    $"The second key idea is that small changes in one part of {topic.ToLowerInvariant()} can change the whole result over time. " +
    $"A third idea worth memorising is that {topic.ToLowerInvariant()} can be measured, compared and explained with simple evidence. " +
    $"Teachers often ask students to describe how {topic.ToLowerInvariant()} links to everyday life and to earlier chapters. ";

PdfDocumentBuilder b = new();
PdfDocumentBuilder.AddedFont font = b.AddStandard14Font(Standard14Font.Helvetica);
for (int p = 1; p <= 14; p++)
{
    PdfPageBuilder page = b.AddPage(612, 792);
    page.AddText("Quizymode Science Revision Guide - Unit Notes", 9, new PdfPoint(50, 760), font);
    string topic = topics[p - 1];
    double y = 720;
    page.AddText($"Chapter {p}: {topic}", 14, new PdfPoint(50, y), font);
    y -= 28;
    for (int para = 1; para <= 6; para++)
    {
        string text = Para(topic, para);
        List<string> lines = [];
        string current = "";
        foreach (string word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if ((current + " " + word).Length > 95) { lines.Add(current); current = word; }
            else current = current.Length == 0 ? word : current + " " + word;
        }
        if (current.Length > 0) lines.Add(current);
        foreach (string line in lines) { page.AddText(line, 8, new PdfPoint(50, y), font); y -= 10; }
        y -= 5;
    }
    page.AddText($"Page {p} of 14", 9, new PdfPoint(280, 40), font);
}
File.WriteAllBytes(Path.Combine(outDir, "science-guide-14p.pdf"), b.Build());

PdfDocumentBuilder s = new();
PdfDocumentBuilder.AddedFont sf = s.AddStandard14Font(Standard14Font.Helvetica);
for (int p = 1; p <= 6; p++) { s.AddPage(612, 792).AddText($"{p}", 10, new PdfPoint(300, 40), sf); }
File.WriteAllBytes(Path.Combine(outDir, "scanned-like.pdf"), s.Build());

byte[] png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
File.WriteAllBytes(Path.Combine(outDir, "not-really-a-pdf.pdf"), png);

using (WordprocessingDocument doc = WordprocessingDocument.Create(Path.Combine(outDir, "history-notes.docx"), WordprocessingDocumentType.Document))
{
    MainDocumentPart main = doc.AddMainDocumentPart();
    main.Document = new Document(new Body());
    Body body = main.Document.Body!;
    void Heading(string t) => body.Append(new Paragraph(new ParagraphProperties(new ParagraphStyleId { Val = "Heading1" }), new Run(new Text(t))));
    void Body1(string t) => body.Append(new Paragraph(new Run(new Text(t))));
    StyleDefinitionsPart styles = main.AddNewPart<StyleDefinitionsPart>();
    styles.Styles = new Styles(new Style(new StyleName { Val = "heading 1" }) { Type = StyleValues.Paragraph, StyleId = "Heading1" });
    Heading("The Industrial Revolution");
    for (int rep = 1; rep <= 22; rep++) Body1("The Industrial Revolution began in Britain in the late eighteenth century and changed how goods were made. Factories replaced many small workshops, and steam power drove new machines. Cities grew quickly as families moved from farms to find work in mills. Note " + rep + ".");
    Body1("Textile production was transformed by inventions such as the spinning jenny and the power loom. Coal and iron became the basic materials of the new industrial economy.");
    Heading("Railways and Trade");
    for (int rep = 1; rep <= 22; rep++) Body1("Railways connected factories, ports and cities during the nineteenth century. Cheap and fast transport let manufacturers sell goods across the whole country. The telegraph spread news along the railway lines within minutes. Note " + rep + ".");
    Body1("Trade grew as steamships carried raw cotton, sugar and tea around the world. Banks and insurance companies expanded to finance this growing international trade.");
    Heading("Social Change");
    for (int rep = 1; rep <= 22; rep++) Body1("Industrial towns were crowded and often unhealthy, and reformers pushed for public sanitation and shorter working days. Laws gradually limited child labour and required safer factory conditions. Trade unions formed so that workers could bargain together for better pay. Note " + rep + ".");
}
Console.WriteLine("files written to " + outDir);
