# PostgreSQL Feature Migration Example

This document shows how to update a feature from MongoDB to PostgreSQL/EF Core.

## Example: Update AddItem Feature

### Before (MongoDB)

```csharp
internal static async Task<Result<Response>> HandleAsync(
    Request request,
    MongoDbContext db,
    ISimHashService simHashService,
    CancellationToken cancellationToken)
{
    try
    {
        var questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
        var fuzzySignature = simHashService.ComputeSimHash(questionText);
        var fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

        var item = new ItemModel
        {
            CategoryId = request.CategoryId,
            SubcategoryId = request.SubcategoryId,
            Visibility = request.Visibility,
            Question = request.Question,
            CorrectAnswer = request.CorrectAnswer,
            IncorrectAnswers = request.IncorrectAnswers,
            Explanation = request.Explanation,
            FuzzySignature = fuzzySignature,
            FuzzyBucket = fuzzyBucket,
            CreatedBy = "dev_user",
            CreatedAt = DateTime.UtcNow
        };

        await db.Items.InsertOneAsync(item, cancellationToken: cancellationToken);
        
        // ... return response
    }
}
```

### After (PostgreSQL/EF Core)

```csharp
internal static async Task<Result<Response>> HandleAsync(
    Request request,
    ApplicationDbContext db,
    ISimHashService simHashService,
    CancellationToken cancellationToken)
{
    try
    {
        var questionText = $"{request.Question} {request.CorrectAnswer} {string.Join(" ", request.IncorrectAnswers)}";
        var fuzzySignature = simHashService.ComputeSimHash(questionText);
        var fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

        var item = new Item
        {
            Id = Guid.NewGuid(), // Or use database default
            CategoryId = request.CategoryId,
            SubcategoryId = request.SubcategoryId,
            Visibility = request.Visibility,
            Question = request.Question,
            CorrectAnswer = request.CorrectAnswer,
            IncorrectAnswers = request.IncorrectAnswers, // Still List<string>!
            Explanation = request.Explanation,
            FuzzySignature = fuzzySignature,
            FuzzyBucket = fuzzyBucket,
            CreatedBy = "dev_user",
            CreatedAt = DateTime.UtcNow
        };

        db.Items.Add(item);
        await db.SaveChangesAsync(cancellationToken);
        
        // ... return response
    }
}
```

## Key Changes

1. **Change parameter type**: `MongoDbContext` → `ApplicationDbContext`
2. **Change model type**: `ItemModel` → `Item`
3. **Change operations**: 
   - `db.Items.InsertOneAsync()` → `db.Items.Add()` + `db.SaveChangesAsync()`
   - `db.Items.Find().ToListAsync()` → `db.Items.Where().ToListAsync()`
   - `db.Items.DeleteOneAsync()` → `db.Items.Remove()` + `db.SaveChangesAsync()`

## IncorrectAnswers Handling

✅ **No changes needed!** The `IncorrectAnswers` property remains `List<string>` - EF Core automatically stores it as JSONB in PostgreSQL.

## Benefits

- ✅ Same API - no changes to request/response DTOs
- ✅ Type safety maintained
- ✅ Automatic JSONB mapping
- ✅ Can query JSONB if needed in the future

