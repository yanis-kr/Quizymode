using Aspire.Hosting;
using Aspire.Hosting.MongoDB;
//var builder = DistributedApplication.CreateBuilder(args);

// MongoDB resource
//var mongo = builder.AddMongoDB("mongo")
//    .WithDataVolume()
//    .WithEnvironment("MONGO_INITDB_ROOT_USERNAME", "admin")
//    .WithEnvironment("MONGO_INITDB_ROOT_PASSWORD", "admin123");

//// API project wired to MongoDB with connection string
//builder.AddProject<Projects.Quizymode_Api>("quizymode-api")
//    .WithReference(mongo)
//    // Use internal Docker DNS name and default port; includes credentials and authSource
//    .WithEnvironment("ConnectionStrings__MongoDB", "mongodb://admin:admin123@mongo:27017/?authSource=admin");

var builder = DistributedApplication.CreateBuilder(args);
var mongo = builder.AddMongoDB("mongo")
                   .WithMongoExpress();
//.WithDataVolume()
//.WithLifetime(ContainerLifetime.Persistent);

var mongodb = mongo.AddDatabase("mongodb");

builder.AddProject<Projects.Quizymode_Api>("quizymode-api")
       .WithReference(mongodb)
       .WaitFor(mongodb);

builder.Build().Run();
