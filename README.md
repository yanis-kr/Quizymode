# Quizymode

A quiz application API built with ASP.NET Core 9, Entity Framework Core, and PostgreSQL, following Vertical Slice Architecture principles and inspired by [Milan Jovanović's Clean Architecture template](https://www.milanjovanovic.tech/pragmatic-clean-architecture).

## Overview

Quizymode is a RESTful API for managing quiz items. It provides endpoints for creating, retrieving, updating, and deleting quiz items with support for categories, subcategories, and duplicate detection using SimHash algorithms.

Visit [https://www.quizymode.com/](https://www.quizymode.com/) to use the application.

### Key Features

- **Quiz Item Management**: Create, read, update, and delete quiz items
- **Bulk Operations**: Import multiple items at once
- **Duplicate Detection**: SimHash-based fuzzy matching to prevent duplicate questions
- **PostgreSQL**: Robust relational database with JSONB support for flexible data storage
- **ASP.NET Core 9**: Modern, high-performance web API framework
- **.NET Aspire**: Containerized development environment with PostgreSQL and pgAdmin

## Tech Stack

- **.NET 9.0** - Latest .NET runtime
- **ASP.NET Core 9** - Web API framework
- **Entity Framework Core 9** - ORM with PostgreSQL support
- **PostgreSQL** - Relational database with JSONB support
- **.NET Aspire** - Cloud-ready application orchestration
- **FluentValidation** - Input validation
- **Serilog** - Structured logging

## Getting Started

### Prerequisites

- .NET 9 SDK
- Docker Desktop (for PostgreSQL container)
- .NET Aspire workload (installed automatically)

### Running the Application

1. **Install EF Core Tools** (if not already installed):

   ```bash
   dotnet tool install --global dotnet-ef
   ```

2. **Start the AppHost** (starts API, PostgreSQL, and pgAdmin):

   ```bash
   cd src/Quizymode.Api.AppHost
   dotnet run
   ```

   This will start:

   - **API**: `https://localhost:8080` (port 6000 is blocked by Chrome)
   - **Aspire Dashboard**: Opens automatically at `https://localhost:5000`
   - **pgAdmin**: Access via Aspire Dashboard

3. **Start the Web UI** (in a separate terminal):

   ```bash
   cd src/Quizymode.Web
   npm install  # First time only
   npm run dev
   ```

   **Note:** Requires Node.js 20.19+ or 22.12+. Upgrade Node.js if you see version warnings.

   The Web UI will be available at `http://localhost:7000` (React/Vite dev server - **HTTP only, not HTTPS**)

4. **Access the Services**:

   - **Web UI**: `http://localhost:7000` (run separately via `npm run dev`)
   - **API**: `https://localhost:8080`
   - **Aspire Dashboard**: Opens automatically at `https://localhost:5000`
   - **pgAdmin**: Access via Aspire Dashboard

5. **Database Setup**:

   - Migrations are applied automatically on startup
   - Initial data is seeded from JSON files in `data/seed/`

6. **Authentication for Local Development**

   The API uses **JWT Bearer tokens from AWS Cognito**. Swagger is configured with a `Bearer` security scheme and most write or user-specific endpoints require authentication.

   1. Configure Cognito settings in `appsettings.Development.json` or user-secrets:

      ```json
      "Authentication": {
        "Cognito": {
          "Authority": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LiJbvT212",
          "Audience": "<your_cognito_app_client_id>"
        }
      }
      ```

   2. Use the Cognito **Hosted UI** (or Amplify) for your user pool/client to sign in locally and obtain an ID or access token. After signing in, capture the JWT (for example from the callback URL fragment or browser dev tools).

   3. In Swagger UI (development only):

      - Navigate to the API (for example `https://localhost:8080`).
      - Open the Swagger UI and click the **Authorize** button.
      - In the `Bearer` scheme, paste: `Bearer {your_jwt_here}` and confirm.

   4. Alternatively, call the API via `curl` or a REST client:

      ```bash
      curl -H "Authorization: Bearer {your_jwt_here}" https://localhost:8080/items
      ```

   Endpoints such as `POST /items`, `PUT /items/{id}`, `DELETE /items/{id}`, `POST /requests`, `POST/PUT/DELETE /reviews`, `POST/PUT/DELETE /collections`, `POST /items/bulk`, and `PUT /items/{id}/visibility` require a valid JWT (admin policy for bulk/visibility).

### API Endpoints

- `GET /items` - Get paginated list of quiz items
- `GET /items/random` - Get random quiz items (optional category, subcategory, count)
- `POST /items` - Create a new quiz item
- `POST /items/bulk` - Create multiple items at once
- `DELETE /items/{id}` - Delete a quiz item

## Project Structure

```
src/
├── Quizymode.Api/              # Main API application
│   ├── Features/                # Vertical Slice Architecture features
│   │   └── Items/              # Quiz items feature
│   ├── Shared/                  # Shared code
│   │   ├── Kernel/             # Domain primitives (Result, Error, Entity)
│   │   └── Models/             # Domain models
│   ├── Data/                   # Data access layer
│   │   ├── Configurations/     # EF Core entity configurations
│   │   └── Migrations/         # Database migrations
│   └── Services/               # Application services
├── Quizymode.Api.AppHost/      # Aspire orchestration project
└── Quizymode.Api.ServiceDefaults/  # Shared Aspire service defaults
```

## Development

### Creating Migrations

```bash
cd src/Quizymode.Api
dotnet ef migrations add MigrationName --output-dir Data/Migrations
```

### Applying Migrations

Migrations are applied automatically on startup. To apply manually:

```bash
dotnet ef database update
```

### Running Tests

```bash
dotnet test
```

## Deployment

### Deploying Web Application to S3

The web application can be deployed to AWS S3 using the provided PowerShell script.

**Prerequisites:**

- AWS CLI installed and configured
- AWS credentials configured (via `aws configure` or environment variables)
- Node.js installed (for building the web project)

**Deploy to S3:**

```powershell
.\scripts\deploy-to-s3.ps1
```

**Options:**

- `-SkipBuild` - Skip building the web project (use existing build output)
- `-SkipCloudFrontInvalidation` - Skip CloudFront cache invalidation

**Examples:**

```powershell
# Full deployment (build + deploy + invalidate cache)
.\scripts\deploy-to-s3.ps1

# Deploy without rebuilding
.\scripts\deploy-to-s3.ps1 -SkipBuild

# Deploy without invalidating CloudFront cache
.\scripts\deploy-to-s3.ps1 -SkipCloudFrontInvalidation
```

The script will:

1. Verify AWS CLI installation and credentials
2. Build the web project (unless `-SkipBuild` is specified)
3. Sync files to S3 bucket `quizymode-web`
4. Set appropriate cache headers (immutable for assets, no-cache for HTML)
5. Invalidate CloudFront cache (unless `-SkipCloudFrontInvalidation` is specified)

**S3 Bucket Configuration:**

- Bucket: `quizymode-web`
- CloudFront Distribution: `EH1DS9REH8KR5`
- The bucket policy restricts access to CloudFront only

## Documentation

For detailed documentation, see the `docs/` folder (development documentation only, not included in distribution).

## License

MIT License - see [LICENSE.txt](LICENSE.txt) for details.
