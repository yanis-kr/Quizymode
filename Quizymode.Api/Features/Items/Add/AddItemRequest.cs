namespace Quizymode.Api.Features.Items.Add;

public record AddItemRequest(
    string CategoryId,
    string SubcategoryId,
    string Visibility,
    string Question,
    string CorrectAnswer,
    List<string> IncorrectAnswers,
    string Explanation);
