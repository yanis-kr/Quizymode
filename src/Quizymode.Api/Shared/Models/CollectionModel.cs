using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Quizymode.Api.Shared.Models;

public class CollectionModel
{
    [BsonId]
    [BsonRepresentation(BsonType.String)]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("description")]
    public string Description { get; set; } = string.Empty;

    [BsonElement("categoryId")]
    public string CategoryId { get; set; } = string.Empty;

    [BsonElement("subcategoryId")]
    public string SubcategoryId { get; set; } = string.Empty;

    [BsonElement("visibility")]
    public string Visibility { get; set; } = "global"; // "global" | "private"

    [BsonElement("createdBy")]
    public string CreatedBy { get; set; } = string.Empty;

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [BsonElement("itemCount")]
    public int ItemCount { get; set; } = 0;
}
