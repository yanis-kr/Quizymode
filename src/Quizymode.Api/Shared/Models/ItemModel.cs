using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Quizymode.Api.Shared.Models;

public class ItemModel
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [BsonElement("categoryId")]
    public string CategoryId { get; set; } = string.Empty;

    [BsonElement("subcategoryId")]
    public string SubcategoryId { get; set; } = string.Empty;

    [BsonElement("visibility")]
    public string Visibility { get; set; } = "global"; // "global" | "private"

    [BsonElement("question")]
    public string Question { get; set; } = string.Empty;

    [BsonElement("correctAnswer")]
    public string CorrectAnswer { get; set; } = string.Empty;

    [BsonElement("incorrectAnswers")]
    public List<string> IncorrectAnswers { get; set; } = new(); // 0..4

    [BsonElement("explanation")]
    public string Explanation { get; set; } = string.Empty;

    [BsonElement("fuzzySignature")]
    public string FuzzySignature { get; set; } = string.Empty; // hex of 64-bit SimHash

    [BsonElement("fuzzyBucket")]
    public int FuzzyBucket { get; set; } // top 8 bits (0..255)

    [BsonElement("createdBy")]
    public string CreatedBy { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
