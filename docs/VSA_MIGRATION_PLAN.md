# Vertical Slice Architecture Migration Plan

## Executive Summary

This document outlines the plan to migrate the Quizymode application to a fully Vertical Slice Architecture (VSA) structure based on Milan Jovanović's recommendations, while preserving the Clean Architecture template reference under `refCA/clean-architecture`.

## Current State Analysis

### Quizymode Application (src/Quizymode.Api)
✅ **Already VSA-Aligned Elements:**
- Feature-based organization (`Features/Collections`, `Features/Items`, `Features/Import`)
- Each feature has its own folder with endpoints and handlers
- Single project structure (no unnecessary layer separation)

❌ **Missing VSA Best Practices:**
1. Features don't use static classes with nested types (Milan's recommended pattern)
2. No FluentValidation integration
3. No Result pattern for error handling
4. No SharedKernel abstractions (Result, Error, Entity base classes)
5. Manual DI registration in separate extension files
6. Domain models in `Shared/Models` instead of being closer to features or in a proper Domain structure
7. No IFeatureRegistration pattern for automatic feature discovery

### Reference Clean Architecture (refCA/clean-architecture)
- **Project Structure:** Separate projects (SharedKernel, Domain, Application, Infrastructure, Web.Api)
- **Pattern:** Traditional Clean Architecture with CQRS
- **Purpose:** Reference template to extract shared abstractions and domain patterns

## VSA Project Structure Recommendations

### Recommended Structure

Based on Milan Jovanović's VSA approach and industry best practices:

```
src/Quizymode.Api/
├── Features/                          # Vertical Slices
│   ├── Collections/
│   │   ├── Add/
│   │   │   └── AddCollection.cs       # Static class with Request, Response, Validator, Endpoint nested
│   │   ├── Get/
│   │   │   └── GetCollections.cs      # Query slice
│   │   ├── Update/
│   │   └── Delete/
│   ├── Items/
│   │   ├── Add/
│   │   ├── Get/
│   │   ├── Update/
│   │   └── Delete/
│   └── Import/
│       └── ImportFromJson.cs
├── Shared/                            # Shared code across features
│   ├── Domain/                        # Shared domain entities (if truly cross-feature)
│   │   ├── Collection.cs
│   │   └── Item.cs
│   ├── Kernel/                        # SharedKernel abstractions
│   │   ├── Result.cs
│   │   ├── Error.cs
│   │   ├── ValidationError.cs
│   │   ├── Entity.cs
│   │   ├── IDomainEvent.cs
│   │   ├── IDomainEventHandler.cs
│   │   └── IDateTimeProvider.cs
│   └── Models/                        # Persistence models (MongoDB documents)
│       ├── CollectionModel.cs
│       └── ItemModel.cs
├── Data/                              # Data access infrastructure
│   ├── MongoDbContext.cs
│   └── MongoDbExtensions.cs
├── Services/                          # Cross-cutting services
│   ├── MongoDbService.cs
│   └── SimHashService.cs
└── StartupExtensions/                 # Bootstrap and configuration
    ├── StartupExtensions.cs
    ├── MongoDbExtensions.cs
    └── ...
```

### Key Decisions

#### ✅ Keep Single Project
- **Rationale:** VSA works best with a single project for most applications
- **Benefits:** Simplified development, easier navigation, reduced coupling
- **Exception:** Only split if you have multiple deployable applications

#### ✅ Keep SharedKernel (as Shared/Kernel)
- **Rationale:** Truly shared abstractions (Result, Error, Entity) are infrastructure concerns
- **Location:** `Shared/Kernel/` folder within the API project
- **Contents:** Result pattern, Error types, base Entity, domain event interfaces

#### ✅ Domain Entities Location
- **Option A (Preferred):** Keep domain entities in features if feature-specific
- **Option B:** Move to `Shared/Domain/` if truly shared across multiple features
- **Recommendation:** Start with feature-local entities, extract to `Shared/Domain/` only when needed

#### ✅ Persistence Models Separate
- **Rationale:** MongoDB document models are infrastructure concerns
- **Location:** Keep in `Shared/Models/` (or rename to `Data/Models/`)
- **Note:** Domain entities and persistence models can coexist - use mapping

#### ❌ No Separate Domain Project
- **Rationale:** VSA emphasizes feature cohesion over layer separation
- **Exception:** Only if domain logic needs to be shared across multiple applications

#### ❌ No Separate Application Project
- **Rationale:** Application logic belongs in feature slices
- **Pattern:** Handlers live inside feature static classes as nested types

#### ✅ Feature Registration Pattern
- **Rationale:** Automatic discovery reduces boilerplate
- **Pattern:** `IFeatureRegistration` interface (as mentioned in .cursorrules)
- **Implementation:** Each feature implements registration for its dependencies

## Migration Strategy

### Phase 1: Foundation (SharedKernel)
1. ✅ Create `Shared/Kernel/` folder structure
2. ✅ Copy/adapt Result pattern from refCA (`Result.cs`, `Error.cs`, `ValidationError.cs`)
3. ✅ Copy/adapt Entity base class from refCA
4. ✅ Copy domain event abstractions
5. ✅ Copy/adapt IDateTimeProvider

### Phase 2: Add Validation Infrastructure
1. ✅ Add FluentValidation NuGet package
2. ✅ Create validation middleware/behavior
3. ✅ Update Program.cs to register validators

### Phase 3: Migrate First Feature (Collections/Add)
1. ✅ Refactor to static class pattern:
   ```csharp
   public static class AddCollection
   {
       public record Request(...);
       public record Response(...);
       
       public class Validator : AbstractValidator<Request> { ... }
       
       public class Endpoint : IEndpoint
       {
           public void MapEndpoint(IEndpointRouteBuilder app) { ... }
       }
       
       internal static async Task<Result<Response>> HandleAsync(
           Request request,
           MongoDbContext db,
           CancellationToken ct) { ... }
   }
   ```
2. ✅ Implement FluentValidation validator
3. ✅ Use Result pattern for error handling
4. ✅ Create IFeatureRegistration implementation

### Phase 4: Migrate Remaining Features
1. ✅ Apply same pattern to all Collections features
2. ✅ Apply same pattern to all Items features
3. ✅ Apply same pattern to Import feature

### Phase 5: Feature Registration System
1. ✅ Create `IFeatureRegistration` interface
2. ✅ Implement in each feature
3. ✅ Auto-discover and register features on startup
4. ✅ Remove manual DI registration in StartupExtensions

### Phase 6: Domain Modeling Enhancement
1. ✅ Review domain entities - keep feature-local or move to Shared/Domain
2. ✅ Separate domain entities from persistence models if needed
3. ✅ Add domain events where appropriate

### Phase 7: Cleanup
1. ✅ Remove unused extension classes
2. ✅ Update documentation
3. ✅ Verify all features follow the pattern

## Implementation Details

### Feature Structure Template

```csharp
namespace Quizymode.Api.Features.Collections.Add;

public static class AddCollection
{
    // Request DTO
    public sealed record Request(
        string Name,
        string Description,
        string CategoryId,
        string SubcategoryId,
        string Visibility);
    
    // Response DTO
    public sealed record Response(
        string Id,
        string Name,
        DateTime CreatedAt);
    
    // FluentValidation validator
    public sealed class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Name)
                .NotEmpty()
                .MaximumLength(200);
            
            RuleFor(x => x.CategoryId)
                .NotEmpty();
            // ... more rules
        }
    }
    
    // Minimal API endpoint
    public sealed class Endpoint : IEndpoint
    {
        public void MapEndpoint(IEndpointRouteBuilder app)
        {
            app.MapPost("collections", Handler)
                .WithTags("Collections")
                .WithSummary("Create a new collection")
                .RequireAuthorization();
        }
        
        private static async Task<IResult> Handler(
            Request request,
            IValidator<Request> validator,
            MongoDbContext db,
            CancellationToken ct)
        {
            var validationResult = await validator.ValidateAsync(request, ct);
            if (!validationResult.IsValid)
            {
                return Results.BadRequest(validationResult.Errors);
            }
            
            Result<Response> result = await HandleAsync(request, db, ct);
            
            return result.Match(
                value => Results.Created($"/api/collections/{value.Id}", value),
                error => Results.Problem(error.Description));
        }
        
        internal static async Task<Result<Response>> HandleAsync(
            Request request,
            MongoDbContext db,
            CancellationToken ct)
        {
            // Business logic here
            var collection = new CollectionModel { ... };
            await db.Collections.InsertOneAsync(collection, cancellationToken: ct);
            
            return Result.Success(new Response(...));
        }
    }
}

// Feature registration
public sealed class AddCollectionFeatureRegistration : IFeatureRegistration
{
    public void AddToServiceCollection(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IValidator<AddCollection.Request>, AddCollection.Validator>();
    }
}
```

### IFeatureRegistration Interface

```csharp
namespace Quizymode.Api.Features;

public interface IFeatureRegistration
{
    void AddToServiceCollection(IServiceCollection services, IConfiguration configuration);
}
```

### Auto-Discovery in Program.cs

```csharp
// Discover and register all features
builder.Services.Scan(scan => scan
    .FromAssemblyOf<Program>()
    .AddClasses(classes => classes.AssignableTo<IFeatureRegistration>())
    .AsImplementedInterfaces()
    .WithScopedLifetime());

// Execute registrations
var featureRegistrations = builder.Services
    .BuildServiceProvider()
    .GetServices<IFeatureRegistration>();
    
foreach (var registration in featureRegistrations)
{
    registration.AddToServiceCollection(builder.Services, builder.Configuration);
}
```

## Benefits of This Approach

1. **Feature Cohesion:** All code for a feature lives together
2. **Easy Navigation:** Find everything related to "AddCollection" in one place
3. **Reduced Coupling:** Features don't depend on each other
4. **CQRS Out of the Box:** Commands and queries naturally separated
5. **Simplified Testing:** Test features in isolation
6. **Faster Development:** No jumping between layers
7. **Maintainability:** Changes are localized to features

## Considerations

### When to Extract Shared Code

1. **SharedKernel (Always):** Base abstractions used by all features
2. **Domain Entities:** Only if shared across 3+ features
3. **Services:** Keep in `Services/` if cross-cutting (e.g., SimHashService)
4. **Utilities:** Extract only when duplicated 3+ times

### When to Keep Separate Projects

1. **Multiple Applications:** If you have Web.Api, Worker, etc. that share domain
2. **Separate Deployments:** If features need independent deployment
3. **Library Distribution:** If you're building reusable libraries

## References

- [Milan Jovanović - Vertical Slice Architecture](https://www.milanjovanovic.tech/blog/vertical-slice-architecture-structuring-vertical-slices)
- Clean Architecture Template: `refCA/clean-architecture/`
- Project Rules: `.cursorrules`

## Next Steps

1. Review and approve this plan
2. Begin Phase 1 (Foundation) implementation
3. Migrate one feature fully as a proof of concept
4. Iterate based on learnings
5. Complete full migration

