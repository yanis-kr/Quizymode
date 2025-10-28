var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.Quizymode_Api>("quizymode-api");

builder.Build().Run();
