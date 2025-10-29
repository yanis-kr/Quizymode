namespace Quizymode.Api.Shared.Models;

public class JsonImportRequest
{
    public string CategoryId { get; set; } = string.Empty;
    public string SubcategoryId { get; set; } = string.Empty;
    public string Visibility { get; set; } = "global";
    public List<JsonImportItem> Items { get; set; } = new();
}

public class JsonImportItem
{
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    public List<string> IncorrectAnswers { get; set; } = new();
    public string Explanation { get; set; } = string.Empty;
}


