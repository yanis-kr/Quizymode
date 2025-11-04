# Bulk Item Creation - Best Practices

## Overview

When creating multiple items in a single request, follow these best practices for performance, reliability, and user experience.

## Recommended Approach: Single Endpoint with Array

### Option 1: POST `/api/items/bulk` (Recommended)

**Pros:**
- ✅ Single transaction for atomicity
- ✅ Better performance (batch insert)
- ✅ Simpler API surface
- ✅ Can provide partial success results

**Implementation Pattern:**

```csharp
public static class AddItemsBulk
{
    public sealed record Request(
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        List<ItemRequest> Items);

    public sealed record ItemRequest(
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation);

    public sealed record Response(
        int CreatedCount,
        int DuplicateCount,
        int FailedCount,
        List<string> DuplicateQuestions,
        List<ItemError> Errors);

    public sealed record ItemError(
        int Index,
        string Question,
        string ErrorMessage);
}
```

### Option 2: POST `/api/items` (Accept Array)

**Pros:**
- ✅ Reuses existing endpoint pattern
- ✅ Consistent with single-item creation

**Cons:**
- ⚠️ Less explicit about bulk operation
- ⚠️ May need different validation rules

## Key Design Considerations

### 1. Transaction Handling

**Always use transactions for bulk operations:**

```csharp
using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
try
{
    // Process items
    await db.SaveChangesAsync(cancellationToken);
    await transaction.CommitAsync(cancellationToken);
}
catch
{
    await transaction.RollbackAsync(cancellationToken);
    throw;
}
```

### 2. Validation Strategy

**Three approaches:**

#### Option A: Fail Fast (All or Nothing)
- Validate all items before processing
- If any item fails validation, reject entire request
- **Best for:** Small batches, strict data quality requirements

#### Option B: Partial Success
- Validate each item individually
- Process valid items, report invalid ones
- **Best for:** Large batches, data import scenarios

#### Option C: Best Effort
- Process as many as possible
- Report successes and failures
- **Best for:** Bulk imports where some failures are acceptable

**Recommended: Option B (Partial Success)**

### 3. Batch Size Limits

**Always enforce limits:**

```csharp
public sealed class Validator : AbstractValidator<Request>
{
    public Validator()
    {
        RuleFor(x => x.Items)
            .NotEmpty()
            .Must(items => items.Count <= 100)
            .WithMessage("Cannot create more than 100 items at once");
    }
}
```

**Recommended limits:**
- Small batches: 10-50 items
- Medium batches: 50-200 items
- Large batches: 200-1000 items (consider async processing)

### 4. Duplicate Detection

**Handle duplicates gracefully:**

```csharp
// Check for duplicates before inserting
var existingItems = await db.Items
    .Where(i => i.CategoryId == request.CategoryId &&
               i.SubcategoryId == request.SubcategoryId &&
               i.FuzzyBucket == fuzzyBucket)
    .ToListAsync(cancellationToken);

// Filter out duplicates
var duplicates = items.Where(item => 
    existingItems.Any(existing => 
        existing.Question.Equals(item.Question, StringComparison.OrdinalIgnoreCase) ||
        existing.FuzzySignature == item.FuzzySignature));

var newItems = items.Except(duplicates);
```

### 5. Performance Optimization

**Use batch operations:**

```csharp
// Good: Batch insert
db.Items.AddRange(items);
await db.SaveChangesAsync(cancellationToken);

// Better: Use AddRangeAsync if available, or chunk large batches
const int batchSize = 100;
for (int i = 0; i < items.Count; i += batchSize)
{
    var batch = items.Skip(i).Take(batchSize);
    db.Items.AddRange(batch);
    await db.SaveChangesAsync(cancellationToken);
}
```

### 6. Response Design

**Provide detailed feedback:**

```csharp
public sealed record Response(
    int TotalRequested,
    int CreatedCount,
    int DuplicateCount,
    int FailedCount,
    List<string> DuplicateQuestions,
    List<ItemError> Errors,
    List<CreatedItem> CreatedItems); // Optional: return created items

public sealed record CreatedItem(
    string Id,
    string Question);
```

## Implementation Example

```csharp
public static class AddItemsBulk
{
    public sealed record Request(
        string CategoryId,
        string SubcategoryId,
        string Visibility,
        List<ItemRequest> Items);

    public sealed record ItemRequest(
        string Question,
        string CorrectAnswer,
        List<string> IncorrectAnswers,
        string Explanation);

    public sealed record Response(
        int TotalRequested,
        int CreatedCount,
        int DuplicateCount,
        int FailedCount,
        List<string> DuplicateQuestions,
        List<ItemError> Errors);

    public sealed record ItemError(
        int Index,
        string Question,
        string ErrorMessage);

    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.CategoryId).NotEmpty();
            RuleFor(x => x.SubcategoryId).NotEmpty();
            RuleFor(x => x.Items)
                .NotEmpty()
                .Must(items => items.Count <= 100)
                .WithMessage("Cannot create more than 100 items at once");

            RuleForEach(x => x.Items)
                .SetValidator(new ItemRequestValidator());
        }
    }

    public sealed class ItemRequestValidator : AbstractValidator<ItemRequest>
    {
        public ItemRequestValidator()
        {
            RuleFor(x => x.Question).NotEmpty().MaximumLength(1000);
            RuleFor(x => x.CorrectAnswer).NotEmpty().MaximumLength(500);
            RuleFor(x => x.IncorrectAnswers)
                .Must(answers => answers.Count >= 0 && answers.Count <= 4);
        }
    }

    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("items/bulk", Handler)
                .WithTags("Items")
                .WithSummary("Create multiple items in bulk")
                .WithOpenApi()
                .Produces<Response>(StatusCodes.Status200OK)
                .Produces(StatusCodes.Status400BadRequest);
        }

        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            ApplicationDbContext db,
            ISimHashService simHashService,
            CancellationToken cancellationToken)
        {
            var validationResult = await validator.ValidateAsync(request, cancellationToken);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }

            Result<Response> result = await HandleAsync(request, db, simHashService, cancellationToken);

            return result.Match(
                value => Results.Ok(value),
                error => CustomResults.Problem(result));
        }

        internal static async Task<Result<Response>> HandleAsync(
            Request request,
            ApplicationDbContext db,
            ISimHashService simHashService,
            CancellationToken cancellationToken)
        {
            try
            {
                using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

                List<Item> itemsToInsert = new();
                List<string> duplicateQuestions = new();
                List<ItemError> errors = new();

                for (int i = 0; i < request.Items.Count; i++)
                {
                    ItemRequest itemRequest = request.Items[i];
                    try
                    {
                        string questionText = $"{itemRequest.Question} {itemRequest.CorrectAnswer} {string.Join(" ", itemRequest.IncorrectAnswers)}";
                        string fuzzySignature = simHashService.ComputeSimHash(questionText);
                        int fuzzyBucket = simHashService.GetFuzzyBucket(fuzzySignature);

                        // Check for duplicates
                        bool isDuplicate = await db.Items
                            .AnyAsync(item => 
                                item.CategoryId == request.CategoryId &&
                                item.SubcategoryId == request.SubcategoryId &&
                                item.FuzzyBucket == fuzzyBucket &&
                                (item.Question.Equals(itemRequest.Question, StringComparison.OrdinalIgnoreCase) ||
                                 item.FuzzySignature == fuzzySignature),
                                cancellationToken);

                        if (isDuplicate)
                        {
                            duplicateQuestions.Add(itemRequest.Question);
                            continue;
                        }

                        Item item = new Item
                        {
                            Id = Guid.NewGuid(),
                            CategoryId = request.CategoryId,
                            SubcategoryId = request.SubcategoryId,
                            Visibility = request.Visibility,
                            Question = itemRequest.Question,
                            CorrectAnswer = itemRequest.CorrectAnswer,
                            IncorrectAnswers = itemRequest.IncorrectAnswers,
                            Explanation = itemRequest.Explanation,
                            FuzzySignature = fuzzySignature,
                            FuzzyBucket = fuzzyBucket,
                            CreatedBy = "dev_user", // TODO: Get from auth context
                            CreatedAt = DateTime.UtcNow
                        };

                        itemsToInsert.Add(item);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(new ItemError(i, itemRequest.Question, ex.Message));
                    }
                }

                if (itemsToInsert.Any())
                {
                    db.Items.AddRange(itemsToInsert);
                    await db.SaveChangesAsync(cancellationToken);
                }

                await transaction.CommitAsync(cancellationToken);

                Response response = new Response(
                    request.Items.Count,
                    itemsToInsert.Count,
                    duplicateQuestions.Count,
                    errors.Count,
                    duplicateQuestions,
                    errors);

                return Result.Success(response);
            }
            catch (Exception ex)
            {
                return Result.Failure<Response>(
                    Error.Problem("Items.BulkCreateFailed", $"Failed to create items: {ex.Message}"));
            }
        }
    }
}
```

## Alternative: Async Processing for Large Batches

For very large batches (1000+ items), consider:

1. **Accept request and return immediately**
2. **Process in background**
3. **Provide status endpoint** to check progress
4. **Send notification** when complete

```csharp
// POST /api/items/bulk
// Returns: { JobId: "guid", Status: "Processing" }

// GET /api/items/bulk/{jobId}
// Returns: { Status: "Complete", CreatedCount: 50, ... }
```

## Summary

✅ **Use single bulk endpoint** (`POST /api/items/bulk`)  
✅ **Enforce batch size limits** (100-1000 items)  
✅ **Use transactions** for atomicity  
✅ **Support partial success** (report successes and failures)  
✅ **Detect duplicates** before inserting  
✅ **Provide detailed response** with counts and errors  
✅ **Consider async processing** for very large batches  

