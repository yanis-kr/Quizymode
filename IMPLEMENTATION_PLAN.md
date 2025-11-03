# QuizyMode Clean Architecture Implementation Plan

## Phase 1: Database Migration & Clean Architecture Setup

### 1.1 Add SQL Database Support (Choose One)

#### Option A: PostgreSQL
```bash
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL.NetTopologySuite
```

#### Option B: SQL Server
```bash
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
```

#### Universal packages needed:
```bash
dotnet add package Microsoft.EntityFrameworkCore
dotnet add package Microsoft.EntityFrameworkCore.Design
dotnet add package Microsoft.EntityFrameworkCore.Tools
```

### 1.2 Restructure Project

#### Create new folders:
```
Domain/
  Entities/
  ValueObjects/
  Enums/
  Common/
  Interfaces/

Application/
  Features/ (vertical slices remain here)
  Interfaces/
    Repositories/
    Services/
  DTOs/
  Common/

Infrastructure/
  Persistence/
    DbContext/
    Repositories/
    Configurations/
    Migrations/
  Services/
  
Presentation/
  Endpoints/
  Middleware/
  
Shared/
  Constants/
```

### 1.3 Create Domain Layer

#### Entities:
- `Item.cs` (quiz item)
- `Collection.cs` (collection container)
- `Review.cs` (user reviews)
- `User.cs` (if implementing Identity)

#### Value Objects:
- `Rating.cs` (1-5 stars)
- `FuzzySignature.cs` (SimHash)

#### Enums:
- `Visibility.cs` (global/private)

---

## Phase 2: Collections & Items Relationship Fix

### Current Problem:
- Collections are metadata only
- No explicit relationship to items
- Items reference only category/subcategory

### Solution:
- Add `ItemIds` list to Collection
- OR add `CollectionId` to Item
- Implement proper many-to-many or one-to-many relationship

### Implementation Steps:

1. **Update Collection Entity:**
```csharp
public class Collection
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Description { get; set; }
    public string CreatedBy { get; set; }
    public Visibility Visibility { get; set; }
    public DateTime CreatedAt { get; set; }
    
    // Navigation property
    public virtual ICollection<Item> Items { get; set; } = new List<Item>();
}
```

2. **Update Item Entity:**
```csharp
public class Item
{
    public string Id { get; set; }
    public string CategoryId { get; set; }
    public string SubcategoryId { get; set; }
    public string Question { get; set; }
    public string CorrectAnswer { get; set; }
    public List<string> IncorrectAnswers { get; set; }
    public string Explanation { get; set; }
    public FuzzySignature FuzzySignature { get; set; }
    public string CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    
    // Relationship
    public string? CollectionId { get; set; }
    public virtual Collection? Collection { get; set; }
}
```

3. **Add Repositories:**
```csharp
public interface ICollectionRepository
{
    Task<Collection?> GetByIdAsync(string id);
    Task<Collection?> GetWithItemsAsync(string id);
    Task<IEnumerable<Collection>> GetAllAsync(string? userId = null);
    Task<Collection> CreateAsync(Collection collection);
    Task UpdateAsync(Collection collection);
    Task DeleteAsync(string id);
    Task AddItemAsync(string collectionId, string itemId);
    Task RemoveItemAsync(string collectionId, string itemId);
}
```

---

## Phase 3: Reviews System Implementation

### 3.1 Domain Model

#### Review Entity:
```csharp
public class Review : EntityBase
{
    public string ItemId { get; set; }
    public string UserId { get; set; }
    public Rating Rating { get; set; }
    public string? Comment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
```

#### Rating Value Object:
```csharp
public enum Rating
{
    One = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5
}
```

### 3.2 Application Layer

#### Features/Reviews/UpsertReview/
```
├── UpsertReviewCommand.cs
├── UpsertReviewHandler.cs
├── UpsertReviewRequest.cs
├── UpsertReviewResponse.cs
└── UpsertReviewEndpoint.cs
```

#### Use Case Handler:
```csharp
public class UpsertReviewHandler
{
    private readonly IReviewRepository _reviewRepository;
    
    public async Task<Result<ReviewDto>> HandleAsync(UpsertReviewCommand command)
    {
        // Validate rating is 1-5
        // Check user can only review once
        // Check item exists
        // Upsert review
        // Return result
    }
}
```

### 3.3 Repository Interface

```csharp
public interface IReviewRepository
{
    Task<Review?> GetByUserAndItemAsync(string userId, string itemId);
    Task<IEnumerable<Review>> GetByItemIdAsync(string itemId, int page, int pageSize);
    Task<Review> CreateAsync(Review review);
    Task UpdateAsync(Review review);
    Task DeleteAsync(string reviewId);
    Task<bool> ExistsAsync(string userId, string itemId);
}
```

### 3.4 Endpoints

```csharp
// PUT for upsert
PUT /api/items/{itemId}/reviews
{
    "rating": 5,
    "comment": "Great question!"
}

// GET all reviews for an item
GET /api/items/{itemId}/reviews?page=1&pageSize=20

// DELETE specific review
DELETE /api/items/{itemId}/reviews/{reviewId}
```

---

## Phase 4: Personal Collections

### 4.1 Endpoints

```
GET    /api/collections                    # Get user's collections
GET    /api/collections/{id}               # Get specific collection with items
POST   /api/collections                    # Create collection
PUT    /api/collections/{id}               # Update collection metadata
DELETE /api/collections/{id}               # Delete collection
POST   /api/collections/{id}/items         # Add items (bulk)
DELETE /api/collections/{id}/items/{itemId} # Remove item
```

### 4.2 Business Rules

- User can only modify their own collections
- Deleting collection does NOT delete items
- Adding item to collection verifies item exists
- No duplicates in collection (enforced by unique constraint)

### 4.3 Handler Example

```csharp
public class CreateCollectionHandler
{
    public async Task<Result<CollectionDto>> HandleAsync(CreateCollectionCommand command)
    {
        var collection = new Collection
        {
            Name = command.Name,
            Description = command.Description,
            CreatedBy = command.UserId,
            Visibility = command.Visibility ?? Visibility.Private
        };
        
        var result = await _collectionRepository.CreateAsync(collection);
        return Result.Success(MapToDto(result));
    }
}
```

---

## Phase 5: Random Questions Endpoint

### 5.1 Endpoint

```
GET /api/questions/random?categoryId=french&subcategoryId=numbers&count=10
```

### 5.2 Implementation

#### Handler:
```csharp
public class GetRandomQuestionsHandler
{
    private readonly IQuestionRepository _questionRepository;
    
    public async Task<Result<List<ItemDto>>> HandleAsync(GetRandomQuestionsQuery query)
    {
        var questions = await _questionRepository
            .GetRandomAsync(query.CategoryId, query.SubcategoryId, query.Count);
        
        return Result.Success(questions.Select(MapToDto).ToList());
    }
}
```

#### Repository Method:
```csharp
public async Task<IEnumerable<Item>> GetRandomAsync(
    string? categoryId,
    string? subcategoryId,
    int count)
{
    var query = _dbContext.Items.AsQueryable();
    
    if (!string.IsNullOrEmpty(categoryId))
        query = query.Where(i => i.CategoryId == categoryId);
        
    if (!string.IsNullOrEmpty(subcategoryId))
        query = query.Where(i => i.SubcategoryId == subcategoryId);
    
    // SQL approach (better performance)
    return await query
        .OrderBy(x => Guid.NewGuid())
        .Take(count)
        .ToListAsync();
}
```

---

## Phase 6: Database Migration Strategy

### 6.1 Remove Import Endpoint?

**Recommendation: YES** - Replace with:
```
POST /api/collections/{collectionId}/items/bulk
```

This aligns with the new architecture.

### 6.2 Migrations

```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```

---

## Phase 7: Authentication Setup

### 7.1 Add Identity

```bash
dotnet add package Microsoft.AspNetCore.Identity.EntityFrameworkCore
```

### 7.2 User Entity

```csharp
public class User : IdentityUser
{
    public DateTime CreatedAt { get; set; }
    public ICollection<Collection> Collections { get; set; } = new List<Collection>();
    public ICollection<Review> Reviews { get; set; } = new List<Review>();
}
```

### 7.3 Middleware

```csharp
app.UseAuthentication();
app.UseAuthorization();
```

---

## Implementation Order

### Sprint 1: Foundation
1. ✅ Add EF Core and database package
2. ✅ Create Domain layer structure
3. ✅ Create Application layer structure
4. ✅ Create Infrastructure layer structure
5. ✅ Create Presentation layer structure

### Sprint 2: Core Entities
1. ✅ Implement Item entity
2. ✅ Implement Collection entity
3. ✅ Implement Review entity
4. ✅ Implement Rating enum
5. ✅ Implement Visibility enum

### Sprint 3: Repositories
1. ✅ IItemRepository and ItemRepository
2. ✅ ICollectionRepository and CollectionRepository
3. ✅ IReviewRepository and ReviewRepository

### Sprint 4: Features - Collections
1. ✅ CreateCollection handler and endpoint
2. ✅ GetCollections handler and endpoint
3. ✅ UpdateCollection handler and endpoint
4. ✅ DeleteCollection handler and endpoint
5. ✅ AddItemToCollection handler and endpoint

### Sprint 5: Features - Reviews
1. ✅ UpsertReview handler and endpoint
2. ✅ GetReviews handler and endpoint
3. ✅ DeleteReview handler and endpoint

### Sprint 6: Features - Questions
1. ✅ GetRandomQuestions handler and endpoint
2. ✅ Update GetItems for better filtering

### Sprint 7: Migration & Cleanup
1. ✅ Remove old MongoDB code
2. ✅ Remove Import endpoint
3. ✅ Update seed data
4. ✅ Add authentication

### Sprint 8: Polish
1. ✅ Add FluentValidation
2. ✅ Add error handling middleware
3. ✅ Add logging
4. ✅ Add unit tests
5. ✅ Add integration tests

---

## Code Examples

### Example: Complete Feature Slice

```
Features/Reviews/UpsertReview/
├── UpsertReviewCommand.cs
├── UpsertReviewHandler.cs
├── UpsertReviewRequest.cs
├── UpsertReviewResponse.cs
├── UpsertReviewEndpoint.cs
└── UpsertReviewValidator.cs
```

#### UpsertReviewCommand.cs
```csharp
public record UpsertReviewCommand(
    string ItemId,
    string UserId,
    int Rating,
    string? Comment
);
```

#### UpsertReviewHandler.cs
```csharp
public class UpsertReviewHandler
{
    private readonly IReviewRepository _reviewRepository;
    private readonly IItemRepository _itemRepository;
    private readonly ILogger<UpsertReviewHandler> _logger;
    
    public async Task<Result<ReviewDto>> HandleAsync(UpsertReviewCommand command)
    {
        // Validate rating
        if (command.Rating < 1 || command.Rating > 5)
            return Result.Failure<ReviewDto>("Rating must be between 1 and 5");
        
        // Check item exists
        var item = await _itemRepository.GetByIdAsync(command.ItemId);
        if (item == null)
            return Result.Failure<ReviewDto>("Item not found");
        
        // Check if review exists
        var existingReview = await _reviewRepository
            .GetByUserAndItemAsync(command.UserId, command.ItemId);
        
        if (existingReview != null)
        {
            // Update existing
            existingReview.Rating = (Rating)command.Rating;
            existingReview.Comment = command.Comment;
            existingReview.UpdatedAt = DateTime.UtcNow;
            
            await _reviewRepository.UpdateAsync(existingReview);
            return Result.Success(MapToDto(existingReview));
        }
        else
        {
            // Create new
            var review = new Review
            {
                ItemId = command.ItemId,
                UserId = command.UserId,
                Rating = (Rating)command.Rating,
                Comment = command.Comment,
                CreatedAt = DateTime.UtcNow
            };
            
            var created = await _reviewRepository.CreateAsync(review);
            return Result.Success(MapToDto(created));
        }
    }
    
    private ReviewDto MapToDto(Review review) => new(
        review.Id,
        review.ItemId,
        review.Rating,
        review.Comment,
        review.CreatedAt,
        review.UpdatedAt
    );
}
```

#### UpsertReviewEndpoint.cs
```csharp
public static class UpsertReviewEndpoint
{
    public static void MapUpsertReviewEndpoint(this WebApplication app)
    {
        var group = app.MapGroup("/api/items/{itemId}/reviews")
            .WithTags("Reviews")
            .RequireAuthorization()
            .WithOpenApi();
        
        group.MapPut("/", UpsertReview)
            .WithName("UpsertReview")
            .WithSummary("Create or update a review")
            .Produces<ReviewDto>(201)
            .Produces(400)
            .Produces(404);
    }
    
    private static async Task<IResult> UpsertReview(
        string itemId,
        UpsertReviewRequest request,
        ClaimsPrincipal user,
        UpsertReviewHandler handler,
        IValidator<UpsertReviewRequest> validator)
    {
        var validationResult = await validator.ValidateAsync(request);
        if (!validationResult.IsValid)
            return Results.BadRequest(validationResult.Errors);
        
        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
        var command = new UpsertReviewCommand(
            itemId,
            userId!,
            request.Rating,
            request.Comment
        );
        
        var result = await handler.HandleAsync(command);
        
        if (result.IsSuccess)
            return Results.Ok(result.Value);
        
        return Results.BadRequest(result.Error);
    }
}
```

---

## Testing Strategy

### Unit Tests
- Domain entities and business rules
- Application handlers
- Value objects validation
- Repository logic

### Integration Tests
- End-to-end API tests
- Database integration
- Authentication flows

### Example Test:
```csharp
public class UpsertReviewHandlerTests
{
    [Fact]
    public async Task HandleAsync_WhenItemNotFound_ReturnsFailure()
    {
        // Arrange
        var mockRepository = new Mock<IReviewRepository>();
        var mockItemRepository = new Mock<IItemRepository>();
        mockItemRepository.Setup(x => x.GetByIdAsync(It.IsAny<string>()))
            .ReturnsAsync((Item?)null);
        
        var handler = new UpsertReviewHandler(mockRepository.Object, mockItemRepository.Object);
        var command = new UpsertReviewCommand("item1", "user1", 5, "Great!");
        
        // Act
        var result = await handler.HandleAsync(command);
        
        // Assert
        Assert.True(result.IsFailure);
        Assert.Equal("Item not found", result.Error);
    }
}
```

---

## Next Steps

1. **Choose your database** (PostgreSQL vs SQL Server)
2. **Decide on authentication** (Identity vs External)
3. **Review the architecture** and provide feedback
4. **Set priorities** - which phase to start with?

Once you confirm, I'll start implementing the changes step by step.

