# PostgreSQL Migration Guide

## Recommendation: Use JSONB for Incorrect Answers

For storing the array of 3-4 incorrect answers, **PostgreSQL JSONB** is the best choice because:

✅ **Native PostgreSQL support** - JSONB is a first-class citizen with excellent performance  
✅ **Efficient storage** - Binary format, indexed, and optimized for querying  
✅ **Simple API** - No need to change your domain model (still `List<string>`)  
✅ **Query flexibility** - Can query inside JSON if needed in the future  
✅ **Small array size** - Perfect for 3-4 items (no normalization overhead)  

## Alternative Approaches (Not Recommended)

❌ **Separate table** - Overkill for 3-4 simple strings, adds unnecessary joins  
❌ **Comma-separated string** - Loses type safety, harder to query  
❌ **Multiple columns** (`incorrect_answer_1`, `incorrect_answer_2`, etc.) - Inflexible, messy  

## Implementation Plan

### Step 1: Add EF Core Packages

```xml
<PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="9.0.2" />
<PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL.Json.Net" Version="9.0.2" />
<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="9.0.0">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>
```

### Step 2: Create EF Core Entities

Replace MongoDB models with EF Core entities. Use `List<string>` for incorrect answers - EF Core will automatically map it to JSONB.

### Step 3: Configure JSONB Column

Use EF Core configuration to explicitly map the `IncorrectAnswers` property to JSONB.

### Step 4: Update Features

Replace MongoDB operations with EF Core operations (minimal changes needed).

## Example Entity Configuration

```csharp
public class Item
{
    public Guid Id { get; set; }
    public string CategoryId { get; set; } = string.Empty;
    public string SubcategoryId { get; set; } = string.Empty;
    public string Visibility { get; set; } = "global";
    public string Question { get; set; } = string.Empty;
    public string CorrectAnswer { get; set; } = string.Empty;
    
    // This will be stored as JSONB in PostgreSQL
    public List<string> IncorrectAnswers { get; set; } = new();
    
    public string Explanation { get; set; } = string.Empty;
    public string FuzzySignature { get; set; } = string.Empty;
    public int FuzzyBucket { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

## Benefits of This Approach

1. **No API changes** - Your features continue to use `List<string>`
2. **Type safety** - Still strongly typed in C#
3. **Query support** - Can query JSONB if needed: `db.Items.Where(i => i.IncorrectAnswers.Contains("some value"))`
4. **Performance** - JSONB is indexed and optimized
5. **Future flexibility** - Easy to add nested structures if needed

## Migration Notes

- PostgreSQL JSONB supports arrays natively
- EF Core 9+ has excellent JSON/JSONB support
- Use `HasColumnType("jsonb")` in entity configuration
- Consider adding a check constraint for array length (0-4 items)

