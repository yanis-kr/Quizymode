using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.StudyGuideUploads;
using Quizymode.Api.Services;
using Quizymode.Api.Services.Taxonomy;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace Quizymode.Api.Tests.Features.StudyGuideUploads;

public sealed class StudyGuideUploadTests : DatabaseTestFixture
{
    private const string UserId = "user-a";
    private const string GuideText = "Photosynthesis converts light energy into chemical energy stored in glucose.";

    private readonly StudyGuideUploadQueue _queue = new();
    private readonly ITextModerationService _moderation = StudyGuideUploadTestData.Moderation();

    private static ITaxonomyItemCategoryResolver CategoryResolver()
    {
        Mock<ITaxonomyItemCategoryResolver> resolver = new();
        resolver
            .Setup(x => x.ResolveForItemAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string name, CancellationToken _) => name.Equals("science", StringComparison.OrdinalIgnoreCase)
                ? Result.Success(new Category { Id = Guid.NewGuid(), Name = "Science" })
                : Result.Failure<Category>(Error.Validation("Category.NotFound", $"Category '{name}' not found.")));
        return resolver.Object;
    }

    private static ITaxonomyRegistry Taxonomy()
    {
        Mock<ITaxonomyRegistry> taxonomy = new();
        taxonomy
            .Setup(x => x.IsValidNavigationPath("Science", "biology", "plants"))
            .Returns(true);
        return taxonomy.Object;
    }

    private Task<Result<CreateStudyGuideUpload.Response>> CreateAsync(
        string text = GuideText,
        string category = "science",
        string nav1 = "Biology",
        string nav2 = "plants",
        List<string>? keywords = null,
        string userId = UserId) =>
        CreateStudyGuideUpload.HandleAsync(
            new CreateStudyGuideUpload.Request(text, category, nav1, nav2, keywords),
            DbContext,
            userId,
            _moderation,
            CategoryResolver(),
            Taxonomy(),
            _queue,
            CancellationToken.None);

    private List<Guid> DrainQueue()
    {
        List<Guid> ids = [];
        while (_queue.Reader.TryRead(out Guid id))
        {
            ids.Add(id);
        }

        return ids;
    }

    private StudyGuideUploadProcessor Processor(FakeDeepSeekHandler handler, ApplicationDbContext? db = null) =>
        new(
            db ?? DbContext,
            new DeepSeekQuestionGenerator(
                new HttpClient(handler),
                MsOptions.Create(new DeepSeekOptions { ApiKey = "test-key" }),
                NullLogger<DeepSeekQuestionGenerator>.Instance),
            _moderation,
            MsOptions.Create(new DeepSeekOptions { ApiKey = "test-key" }),
            NullLogger<StudyGuideUploadProcessor>.Instance);

    [Fact]
    public async Task Create_NewText_StoresPendingUploadAndEnqueues()
    {
        Result<CreateStudyGuideUpload.Response> result = await CreateAsync(keywords: ["Chapter-1", "biology"]);

        result.IsSuccess.Should().BeTrue();
        result.Value.IsDuplicate.Should().BeFalse();
        result.Value.Status.Should().Be("Pending");

        StudyGuideUpload upload = await DbContext.StudyGuideUploads.SingleAsync();
        upload.Id.ToString().Should().Be(result.Value.Id);
        upload.UserId.Should().Be(UserId);
        upload.CategoryName.Should().Be("Science");
        upload.NavigationKeyword1.Should().Be("biology");
        upload.TextHash.Should().Be(StudyGuideUploadText.ComputeHash(GuideText));
        GetStudyGuideUpload.ReadKeywords(upload).Should().Equal("chapter-1");
        DrainQueue().Should().Equal(upload.Id);
    }

    [Fact]
    public async Task Create_SameNormalizedTextForSameUser_ReturnsExistingUpload()
    {
        Result<CreateStudyGuideUpload.Response> first = await CreateAsync();
        DrainQueue();

        Result<CreateStudyGuideUpload.Response> second = await CreateAsync(text: "  " + GuideText.ToUpperInvariant() + "\n");

        second.Value.IsDuplicate.Should().BeTrue();
        second.Value.Id.Should().Be(first.Value.Id);
        (await DbContext.StudyGuideUploads.CountAsync()).Should().Be(1);
        DrainQueue().Should().BeEmpty("a pending or completed duplicate is not re-processed");
    }

    [Fact]
    public async Task Create_SameTextForDifferentUser_CreatesSeparateUpload()
    {
        await CreateAsync();
        Result<CreateStudyGuideUpload.Response> other = await CreateAsync(userId: "user-b");

        other.Value.IsDuplicate.Should().BeFalse();
        (await DbContext.StudyGuideUploads.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task Create_FailedDuplicate_IsRetried()
    {
        Result<CreateStudyGuideUpload.Response> first = await CreateAsync();
        DrainQueue();
        StudyGuideUpload upload = await DbContext.StudyGuideUploads.SingleAsync();
        upload.Status = StudyGuideUploadStatus.Failed;
        upload.Error = "boom";
        await DbContext.SaveChangesAsync();

        Result<CreateStudyGuideUpload.Response> retry = await CreateAsync();

        retry.Value.IsDuplicate.Should().BeTrue();
        retry.Value.Status.Should().Be("Pending");
        upload.Error.Should().BeNull();
        DrainQueue().Should().Equal(Guid.Parse(first.Value.Id));
    }

    [Fact]
    public async Task Create_ProfaneInput_IsRejected()
    {
        Result<CreateStudyGuideUpload.Response> result = await CreateAsync(text: "this guide has a badword in it");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("StudyGuideUpload.ProfanityBlocked");
        (await DbContext.StudyGuideUploads.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Create_InvalidTopicPath_IsRejected()
    {
        Result<CreateStudyGuideUpload.Response> result = await CreateAsync(nav2: "rocks");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("StudyGuideUpload.InvalidNavigationPath");
    }

    [Fact]
    public async Task Create_UnknownCategory_IsRejected()
    {
        Result<CreateStudyGuideUpload.Response> result = await CreateAsync(category: "nope");

        result.Error.Code.Should().Be("StudyGuideUpload.InvalidCategory");
    }

    [Fact]
    public async Task Process_ValidReply_CompletesWithQuestions()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();
        Guid id = Guid.Parse(created.Value.Id);
        FakeDeepSeekHandler handler = FakeDeepSeekHandler.ReturningText(StudyGuideUploadTestData.QuestionsJson(5));

        await Processor(handler).ProcessAsync(id, CancellationToken.None);

        GetStudyGuideUpload.Response? response = await GetStudyGuideUpload.HandleAsync(id, DbContext, UserId, CancellationToken.None);
        response!.Status.Should().Be("Completed");
        response.Questions.Should().HaveCount(5);
        response.Questions[0].CorrectAnswer.Should().Be("Answer 1");
        response.CompletedUtc.Should().NotBeNull();
        handler.Requests.Should().ContainSingle();
    }

    [Fact]
    public async Task Process_IsIdempotentForNonPendingUploads()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();
        Guid id = Guid.Parse(created.Value.Id);
        FakeDeepSeekHandler handler = FakeDeepSeekHandler.ReturningText(StudyGuideUploadTestData.QuestionsJson(2));

        await Processor(handler).ProcessAsync(id, CancellationToken.None);
        await Processor(handler).ProcessAsync(id, CancellationToken.None);
        await Processor(handler).ProcessAsync(Guid.NewGuid(), CancellationToken.None);

        handler.Requests.Should().ContainSingle("completed and missing uploads are skipped");
        (await DbContext.StudyGuideUploads.SingleAsync()).Attempts.Should().Be(1);
    }

    [Fact]
    public async Task Process_TooManyQuestions_Fails()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();
        Guid id = Guid.Parse(created.Value.Id);

        await Processor(FakeDeepSeekHandler.ReturningText(StudyGuideUploadTestData.QuestionsJson(21)))
            .ProcessAsync(id, CancellationToken.None);

        StudyGuideUpload upload = await DbContext.StudyGuideUploads.SingleAsync();
        upload.Status.Should().Be(StudyGuideUploadStatus.Failed);
        upload.Error.Should().Contain("maximum is 20");
        upload.GeneratedQuestionsJson.Should().BeNull();
    }

    [Fact]
    public async Task Process_InvalidJson_Fails()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();

        await Processor(FakeDeepSeekHandler.ReturningText("Sure! Here are your questions."))
            .ProcessAsync(Guid.Parse(created.Value.Id), CancellationToken.None);

        (await DbContext.StudyGuideUploads.SingleAsync()).Status.Should().Be(StudyGuideUploadStatus.Failed);
    }

    [Fact]
    public async Task Process_ProfaneOutput_Fails()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();

        await Processor(FakeDeepSeekHandler.ReturningText(StudyGuideUploadTestData.QuestionsJson(2, "Why badword")))
            .ProcessAsync(Guid.Parse(created.Value.Id), CancellationToken.None);

        StudyGuideUpload upload = await DbContext.StudyGuideUploads.SingleAsync();
        upload.Status.Should().Be(StudyGuideUploadStatus.Failed);
        upload.Error.Should().Be(StudyGuideUploadProcessor.ModerationFailureMessage);
    }

    [Fact]
    public async Task Process_ApiError_FailsWithUserSafeMessage()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();

        await Processor(FakeDeepSeekHandler.ReturningStatus(HttpStatusCode.ServiceUnavailable))
            .ProcessAsync(Guid.Parse(created.Value.Id), CancellationToken.None);

        StudyGuideUpload upload = await DbContext.StudyGuideUploads.SingleAsync();
        upload.Status.Should().Be(StudyGuideUploadStatus.Failed);
        upload.Error.Should().Be(DeepSeekQuestionGenerator.UnavailableMessage);
    }

    [Fact]
    public async Task Get_OtherUsersUpload_ReturnsNull()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();

        GetStudyGuideUpload.Response? response = await GetStudyGuideUpload.HandleAsync(
            Guid.Parse(created.Value.Id), DbContext, "user-b", CancellationToken.None);

        response.Should().BeNull();
    }

    [Fact]
    public async Task Worker_RequeuesPendingOnStartupAndProcessesThem()
    {
        await CreateAsync();
        await CreateAsync(text: "Second guide about mitochondria.");
        DrainQueue();
        StudyGuideUpload done = (await DbContext.StudyGuideUploads.ToListAsync())[1];
        done.Status = StudyGuideUploadStatus.Completed;
        await DbContext.SaveChangesAsync();

        FakeDeepSeekHandler handler = FakeDeepSeekHandler.ReturningText(StudyGuideUploadTestData.QuestionsJson(3));
        ServiceCollection services = new();
        services.AddScoped(_ => CreateDbContext());
        services.AddScoped(provider => Processor(handler, provider.GetRequiredService<ApplicationDbContext>()));
        await using ServiceProvider provider = services.BuildServiceProvider();

        StudyGuideUploadWorker worker = new(
            _queue,
            provider.GetRequiredService<IServiceScopeFactory>(),
            MsOptions.Create(new DeepSeekOptions { ApiKey = "test-key" }),
            NullLogger<StudyGuideUploadWorker>.Instance);

        int requeued = await worker.RequeuePendingAsync(CancellationToken.None);
        requeued.Should().Be(1);

        List<Guid> queued = DrainQueue();
        queued.Should().ContainSingle();
        await worker.ProcessOneAsync(queued[0], CancellationToken.None);

        await using ApplicationDbContext verify = CreateDbContext();
        (await verify.StudyGuideUploads.CountAsync(u => u.Status == StudyGuideUploadStatus.Completed)).Should().Be(2);
        handler.Requests.Should().ContainSingle();
    }

    [Fact]
    public async Task Worker_UnexpectedProcessorError_MarksUploadFailed()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();
        Guid id = Guid.Parse(created.Value.Id);

        int calls = 0;
        FakeDeepSeekHandler handler = new((_, _) =>
        {
            calls++;
            throw new InvalidOperationException("unexpected");
        });
        ServiceCollection services = new();
        services.AddScoped(_ => CreateDbContext());
        services.AddScoped(provider => Processor(handler, provider.GetRequiredService<ApplicationDbContext>()));
        await using ServiceProvider provider = services.BuildServiceProvider();

        StudyGuideUploadWorker worker = new(
            _queue,
            provider.GetRequiredService<IServiceScopeFactory>(),
            MsOptions.Create(new DeepSeekOptions { ApiKey = "test-key" }),
            NullLogger<StudyGuideUploadWorker>.Instance);

        await worker.ProcessOneAsync(id, CancellationToken.None);

        calls.Should().Be(1);
        await using ApplicationDbContext verify = CreateDbContext();
        StudyGuideUpload upload = await verify.StudyGuideUploads.SingleAsync();
        upload.Status.Should().Be(StudyGuideUploadStatus.Failed);
        upload.Error.Should().Be(StudyGuideUploadWorker.UnexpectedFailureMessage);
    }

    [Fact]
    public async Task Worker_WithoutApiKey_DoesNothing()
    {
        await CreateAsync();
        DrainQueue();
        ServiceCollection services = new();
        await using ServiceProvider provider = services.BuildServiceProvider();
        StudyGuideUploadWorker worker = new(
            _queue,
            provider.GetRequiredService<IServiceScopeFactory>(),
            MsOptions.Create(new DeepSeekOptions()),
            NullLogger<StudyGuideUploadWorker>.Instance);

        await worker.StartAsync(CancellationToken.None);
        await worker.StopAsync(CancellationToken.None);

        DrainQueue().Should().BeEmpty();
    }

    [Fact]
    public void Config_ReflectsApiKeyPresence()
    {
        GetStudyGuideUploadConfig.Handle(new DeepSeekOptions()).Enabled.Should().BeFalse();
        GetStudyGuideUploadConfig.Response enabled = GetStudyGuideUploadConfig.Handle(new DeepSeekOptions { ApiKey = "k" });
        enabled.Enabled.Should().BeTrue();
        enabled.MaxTextBytes.Should().Be(10240);
        enabled.MaxQuestions.Should().Be(20);
    }

    [Fact]
    public async Task Accept_NotOwnedOrNotReadyOrAlreadyAccepted_IsRejected()
    {
        Result<CreateStudyGuideUpload.Response> created = await CreateAsync();
        Guid id = Guid.Parse(created.Value.Id);

        Task<Result<AcceptStudyGuideUpload.Response?>> Accept(string userId)
        {
            Mock<IUserContext> userContext = new();
            userContext.Setup(x => x.UserId).Returns(userId);
            userContext.Setup(x => x.IsAuthenticated).Returns(true);
            return AcceptStudyGuideUpload.HandleAsync(
                id,
                new AcceptStudyGuideUpload.Request(null),
                DbContext,
                userContext.Object,
                Mock.Of<ISimHashService>(),
                CategoryResolver(),
                Taxonomy(),
                Mock.Of<IAuditService>(),
                CancellationToken.None);
        }

        (await Accept("user-b")).Value.Should().BeNull();

        Result<AcceptStudyGuideUpload.Response?> notReady = await Accept(UserId);
        notReady.Error.Code.Should().Be("StudyGuideUpload.NotReady");

        StudyGuideUpload upload = await DbContext.StudyGuideUploads.SingleAsync();
        upload.Status = StudyGuideUploadStatus.Completed;
        upload.AcceptedUtc = DateTime.UtcNow;
        await DbContext.SaveChangesAsync();

        Result<AcceptStudyGuideUpload.Response?> again = await Accept(UserId);
        again.Error.Code.Should().Be("StudyGuideUpload.AlreadyAccepted");
    }
}
