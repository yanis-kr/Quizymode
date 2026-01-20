# Quizymode

A full-stack quiz application built with ASP.NET Core 9 API and React frontend, following Vertical Slice Architecture principles and inspired by [Milan Jovanović's Clean Architecture template](https://www.milanjovanovic.tech/pragmatic-clean-architecture).

## Overview

Quizymode is a comprehensive quiz application that allows users to create, manage, and study quiz items. The application consists of a RESTful API backend and a modern React web interface. It supports public and private items, categories, collections, ratings, comments, and advanced features like duplicate detection using SimHash algorithms.

Visit [https://www.quizymode.com/](https://www.quizymode.com/) to use the application.

### Key Features

**Core Functionality:**
- **Quiz Item Management**: Create, read, update, and delete quiz items
- **Bulk Operations**: Import multiple items at once via JSON or AI-generated prompts
- **Duplicate Detection**: SimHash-based fuzzy matching to prevent duplicate questions
- **Categories**: Organize items by category with public/private visibility controls
- **Keywords**: Tag items with keywords for better organization and filtering
- **Collections**: Group items into custom collections for focused study sessions
- **Ratings & Comments**: Rate and comment on quiz items
- **User Settings**: Configurable page size and user preferences
- **Explore Mode**: Browse through quiz items in a study-friendly format
- **Quiz Mode**: Test your knowledge with interactive quizzes

**Technical Features:**
- **PostgreSQL**: Robust relational database with JSONB support for flexible data storage
- **ASP.NET Core 9**: Modern, high-performance web API framework
- **React 19 + TypeScript**: Modern frontend with Vite, React Query, and Tailwind CSS
- **AWS Cognito**: User authentication and authorization
- **.NET Aspire**: Containerized development environment with PostgreSQL and pgAdmin
- **Admin Features**: Review board, audit logs, database monitoring

## Tech Stack

**Backend:**
- **.NET 9.0** - Latest .NET runtime
- **ASP.NET Core 9** - Web API framework
- **Entity Framework Core 9** - ORM with PostgreSQL support
- **Dapper** - High-performance data access for complex queries
- **PostgreSQL** - Relational database with JSONB support
- **.NET Aspire** - Cloud-ready application orchestration
- **FluentValidation** - Input validation
- **Serilog** - Structured logging with Grafana Loki integration
- **AWS Cognito** - User authentication

**Frontend:**
- **React 19** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **React Router DOM** - Client-side routing
- **TanStack React Query** - Server state management
- **Tailwind CSS 4** - Utility-first CSS framework
- **Axios** - HTTP client
- **AWS Amplify** - Authentication integration
- **Zod** - Schema validation
- **React Hook Form** - Form handling

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

   Most write operations and user-specific endpoints require authentication:
   - Creating/updating/deleting items (admin required for public items)
   - Managing collections
   - Adding ratings and comments
   - Updating user settings
   - Admin endpoints (review board, audit logs, etc.)

### API Endpoints

**Items:**
- `GET /items` - Get paginated list of quiz items (with filtering by category, keywords, collections, visibility)
- `GET /items/{id}` - Get a specific quiz item
- `GET /items/random` - Get random quiz items (optional category, count)
- `POST /items` - Create a new quiz item
- `POST /items/bulk` - Create multiple items at once
- `PUT /items/{id}` - Update a quiz item
- `DELETE /items/{id}` - Delete a quiz item
- `PUT /items/{id}/visibility` - Set item visibility (admin only)

**Categories:**
- `GET /categories` - Get all categories with item counts and average ratings

**Collections:**
- `GET /collections` - Get user's collections
- `GET /collections/{id}` - Get a specific collection
- `POST /collections` - Create a new collection
- `PUT /collections/{id}` - Update a collection
- `DELETE /collections/{id}` - Delete a collection
- `POST /collections/{id}/items` - Add item to collection
- `DELETE /collections/{id}/items/{itemId}` - Remove item from collection

**Ratings:**
- `GET /ratings` - Get ratings for items
- `POST /ratings` - Add or update a rating

**Comments:**
- `GET /comments` - Get comments for items
- `POST /comments` - Add a comment
- `PUT /comments/{id}` - Update a comment
- `DELETE /comments/{id}` - Delete a comment

**Users:**
- `GET /users/me` - Get current user information
- `PUT /users/me` - Update user name
- `GET /users/settings` - Get user settings
- `PUT /users/settings` - Update user setting

**Admin:**
- `GET /admin/review-board` - Get items pending review
- `POST /admin/items/{id}/approve` - Approve an item
- `GET /admin/audit-logs` - Get audit logs
- `GET /admin/database-size` - Get database size information

## Project Structure

```
src/
├── Quizymode.Api/              # Main API application
│   ├── Features/                # Vertical Slice Architecture features
│   │   ├── Items/              # Quiz items (CRUD, bulk, visibility)
│   │   ├── Categories/         # Category management
│   │   ├── Collections/        # Collection management
│   │   ├── Ratings/            # Item ratings
│   │   ├── Comments/           # Item comments
│   │   ├── Users/              # User management
│   │   ├── UserSettings/       # User preferences
│   │   └── Admin/              # Admin features (review board, audit logs)
│   ├── Shared/                  # Shared code
│   │   ├── Kernel/             # Domain primitives (Result, Error, Entity)
│   │   └── Models/             # Domain models
│   ├── Data/                   # Data access layer
│   │   ├── Configurations/     # EF Core entity configurations
│   │   └── Migrations/         # Database migrations
│   ├── Services/               # Application services
│   │   ├── CategoryResolver/   # Category resolution and creation
│   │   ├── SimHashService/     # Duplicate detection
│   │   ├── UserContext/        # Authentication context
│   │   └── AuditService/       # Audit logging
│   └── StartupExtensions/      # Service registration and configuration
├── Quizymode.Api.AppHost/      # Aspire orchestration project
├── Quizymode.Api.ServiceDefaults/  # Shared Aspire service defaults
└── Quizymode.Web/              # React frontend application
    ├── src/
    │   ├── features/           # Feature-based organization
    │   │   ├── items/          # Item pages (list, create, edit, explore, quiz)
    │   │   ├── categories/     # Category pages
    │   │   ├── collections/    # Collection pages
    │   │   ├── auth/           # Authentication pages
    │   │   └── admin/          # Admin pages
    │   ├── components/         # Reusable UI components
    │   ├── api/                # API client
    │   ├── contexts/           # React contexts (Auth)
    │   └── hooks/              # Custom React hooks
tests/
└── Quizymode.Api.Tests/        # Unit and integration tests
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

### Configuring Grafana Cloud Observability

The application supports sending OpenTelemetry traces, metrics, and logs to Grafana Cloud.

**Prerequisites:**

- Grafana Cloud account (free tier available)
- Grafana Cloud instance ID and API keys

**Configuration:**

See [GRAFANA_CLOUD_SETUP.md](GRAFANA_CLOUD_SETUP.md) for detailed instructions on:

- Setting up Grafana Cloud credentials
- Configuring the application for development and production
- Deploying to AWS Lightsail with Grafana Cloud integration
- Verifying telemetry data in Grafana Cloud

**Quick Start:**

1. Get your Grafana Cloud credentials (Instance ID and API keys)
2. Configure via environment variables or `appsettings.json`:
   ```json
   {
     "GrafanaCloud": {
       "Enabled": true,
       "OtlpEndpoint": "https://otlp-gateway-prod-us-central-0.grafana.net/otlp",
       "LokiEndpoint": "https://logs-prod-us-central-0.grafana.net/loki/api/v1/push",
       "InstanceId": "YOUR_INSTANCE_ID",
       "ApiKey": "YOUR_API_KEY"
     }
   }
   ```
3. Restart the application and verify data in Grafana Cloud

## Documentation

For detailed documentation, see the `docs/` folder (development documentation only, not included in distribution).

## License

MIT License - see [LICENSE.txt](LICENSE.txt) for details.
