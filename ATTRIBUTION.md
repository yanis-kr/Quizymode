# Attribution

This project uses code and patterns from the following sources:

## Milan Jovanović - Clean Architecture Template

The following code and patterns are based on or directly taken from Milan Jovanović's Clean Architecture template:

### Directly Copied/Adapted Code

- **Shared Kernel Classes** (`src/Quizymode.Api/Shared/Kernel/`):
  - `Result.cs` and `Result<TValue>.cs`
  - `Error.cs` and `ErrorType.cs`
  - `Entity.cs`
  - `IDomainEvent.cs`
  - `IDomainEventHandler.cs`
  - `IDateTimeProvider.cs`

These classes are based on the SharedKernel project from Milan Jovanović's Clean Architecture template.

**Source:** [Pragmatic Clean Architecture](https://www.milanjovanovic.tech/pragmatic-clean-architecture) by Milan Jovanović

### Patterns and Concepts

The following architectural patterns and concepts were inspired by Milan Jovanović's work:

- Result pattern for error handling
- Domain Events pattern
- Entity base class for domain events
- Clean Architecture principles
- Vertical Slice Architecture concepts

### License

Milan Jovanović's Clean Architecture template is provided as a learning resource. The code has been adapted and modified for use in this project.

---

## Original Work

All other code in this project is original work developed for the Quizymode application.

