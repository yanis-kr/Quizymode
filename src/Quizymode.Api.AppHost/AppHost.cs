using Aspire.Hosting;

var builder = DistributedApplication.CreateBuilder(args);

// Add PostgreSQL with pgAdmin for database management
var postgres = builder
    .AddPostgres("postgres")
    .WithPgAdmin();

var postgresDb = postgres.AddDatabase("quizymode");

builder.AddProject<Projects.Quizymode_Api>("quizymode-api")
    .WithReference(postgresDb)
    .WaitFor(postgresDb);

builder.Build().Run();
