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

    public DbSet<FeedbackSubmission> FeedbackSubmissions => Set<FeedbackSubmission>();

    public DbSet<Rating> Ratings => Set<Rating>();

    public DbSet<Comment> Comments => Set<Comment>();

    public DbSet<Collection> Collections => Set<Collection>();

    public DbSet<CollectionItem> CollectionItems => Set<CollectionItem>();

    public DbSet<CollectionBookmark> CollectionBookmarks => Set<CollectionBookmark>();

    public DbSet<CollectionShare> CollectionShares => Set<CollectionShare>();

    public DbSet<CollectionRating> CollectionRatings => Set<CollectionRating>();

    public DbSet<User> Users => Set<User>();

    public DbSet<Audit> Audits => Set<Audit>();

    public DbSet<PageView> PageViews => Set<PageView>();

    public DbSet<Keyword> Keywords => Set<Keyword>();

    public DbSet<ItemKeyword> ItemKeywords => Set<ItemKeyword>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<KeywordRelation> KeywordRelations => Set<KeywordRelation>();

    public DbSet<UserSetting> UserSettings => Set<UserSetting>();

    public DbSet<Upload> Uploads => Set<Upload>();

    public DbSet<StudyGuide> StudyGuides => Set<StudyGuide>();

    public DbSet<StudyGuideImportSession> StudyGuideImportSessions => Set<StudyGuideImportSession>();

    public DbSet<StudyGuideChunk> StudyGuideChunks => Set<StudyGuideChunk>();

    public DbSet<StudyGuidePromptResult> StudyGuidePromptResults => Set<StudyGuidePromptResult>();

    public DbSet<StudyGuideDedupResult> StudyGuideDedupResults => Set<StudyGuideDedupResult>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
        
        base.OnModelCreating(modelBuilder);
    }
}

