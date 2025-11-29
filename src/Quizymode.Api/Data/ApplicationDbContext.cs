using Microsoft.EntityFrameworkCore;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Data;

public sealed class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<Item> Items => Set<Item>();

    public DbSet<Request> Requests => Set<Request>();

    public DbSet<Review> Reviews => Set<Review>();

    public DbSet<Rating> Ratings => Set<Rating>();

    public DbSet<Comment> Comments => Set<Comment>();

    public DbSet<Collection> Collections => Set<Collection>();

    public DbSet<CollectionItem> CollectionItems => Set<CollectionItem>();

    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        
        base.OnModelCreating(modelBuilder);
    }
}

