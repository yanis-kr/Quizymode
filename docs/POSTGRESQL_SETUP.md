# PostgreSQL Setup with .NET Aspire

## Local Installation Requirements

### Required Software

1. **Docker Desktop** (or Docker Engine)
   - PostgreSQL and pgAdmin will run in containers via Aspire
   - Download: https://www.docker.com/products/docker-desktop

2. **.NET 9 SDK**
   - Already installed (you're using net9.0)
   - Verify: `dotnet --version`

3. **.NET Aspire Workload** (if not already installed)
   ```bash
   dotnet workload install aspire
   ```

## What Aspire Provides

When you run the AppHost project, Aspire will automatically:

✅ **Start PostgreSQL container** - Database server  
✅ **Start pgAdmin container** - Web-based database explorer UI  
✅ **Configure connection strings** - Automatically injected  
✅ **Monitor health** - Health checks built-in  

## Running the Application

1. **Start Docker Desktop** (if not already running)

2. **Run the AppHost project**:
   ```bash
   cd src/Quizymode.Api.AppHost
   dotnet run
   ```

3. **Access the Aspire Dashboard**:
   - Opens automatically at `http://localhost:15000`
   - Shows all services, including PostgreSQL and pgAdmin

4. **Access pgAdmin**:
   - Click on the "postgres" service in Aspire dashboard
   - Click "Endpoint: pgAdmin" link
   - Or navigate to the URL shown in the dashboard

## pgAdmin Login Credentials

When using Aspire's PostgreSQL, pgAdmin credentials are:
- **Email/Username**: `admin@pgadmin.org`
- **Password**: Auto-generated (check Aspire dashboard for actual password)

Or check the AppHost logs for the generated password.

## First-Time Database Setup

The `DatabaseSeederHostedService` will automatically:
1. Apply EF Core migrations on startup
2. Seed initial data from JSON files in `Data/Seed/`

## Connection String

Aspire automatically provides the connection string to your API project. You don't need to configure it manually - Aspire injects it via the reference.

If running without Aspire, use:
```
Host=localhost;Database=quizymode;Username=postgres;Password=postgres
```

## Troubleshooting

### PostgreSQL not starting
- Ensure Docker Desktop is running
- Check Docker logs: `docker ps` and `docker logs <container-id>`

### Cannot connect to database
- Wait a few seconds after AppHost starts (database needs time to initialize)
- Check Aspire dashboard for service status

### pgAdmin login issues
- Check AppHost console output for generated password
- Or reset: Stop containers and restart AppHost (new password will be generated)

## Database Explorer Alternatives

If you prefer other tools:
- **pgAdmin** - Web-based (included with Aspire) ✅
- **DBeaver** - Desktop app (download separately)
- **DataGrip** - JetBrains IDE (paid)
- **psql** - Command-line (comes with PostgreSQL)

pgAdmin is the easiest option since it's included with Aspire.

