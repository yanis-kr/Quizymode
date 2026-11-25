using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Moq;
using Quizymode.Api.Features.Feedback;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Feedback;

public sealed class CreateFeedbackSubmissionTests : DatabaseTestFixture
{
    [Fact]
    public async Task HandleAsync_AnonymousItemRequest_CreatesSubmission()
    {
        Mock<IUserContext> userContextMock = new();
        userContextMock.Setup(x => x.IsAuthenticated).Returns(false);
        userContextMock.Setup(x => x.UserId).Returns((string?)null);

        DefaultHttpContext httpContext = new();
        httpContext.Request.Headers.UserAgent = "Quizymode.Tests/1.0";

        CreateFeedbackSubmission.Request request = new()
        {
            Type = CreateFeedbackSubmission.RequestItemsType,
            CurrentUrl = "https://www.quizymode.com/categories/aws",
            Details = "Please add more SAA practice questions.",
            Email = "",
            AdditionalKeywords = "aws,saa-c03"
        };

        Result<CreateFeedbackSubmission.Response> result = await CreateFeedbackSubmission.HandleAsync(
            request,
            DbContext,
            userContextMock.Object,
            httpContext,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Type.Should().Be(CreateFeedbackSubmission.RequestItemsType);
        result.Value.Email.Should().BeNull();
        result.Value.AdditionalKeywords.Should().Be("aws,saa-c03");
        result.Value.UserId.Should().BeNull();

        DbContext.FeedbackSubmissions.Should().ContainSingle();
        DbContext.FeedbackSubmissions.Single().UserAgent.Should().Be("Quizymode.Tests/1.0");
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedFeedback_StoresUserId()
    {
        string userId = Guid.NewGuid().ToString();
        Mock<IUserContext> userContextMock = new();
        userContextMock.Setup(x => x.IsAuthenticated).Returns(true);
        userContextMock.Setup(x => x.UserId).Returns(userId);

        DefaultHttpContext httpContext = new();

        CreateFeedbackSubmission.Request request = new()
        {
            Type = CreateFeedbackSubmission.GeneralFeedbackType,
            CurrentUrl = "https://www.quizymode.com/collections",
            Details = "A compact footer feedback entry point works well.",
            Email = "signed@example.com",
            AdditionalKeywords = "ignored"
        };

        Result<CreateFeedbackSubmission.Response> result = await CreateFeedbackSubmission.HandleAsync(
            request,
            DbContext,
            userContextMock.Object,
            httpContext,
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.UserId.Should().Be(userId);
        result.Value.AdditionalKeywords.Should().BeNull();
    }

    [Fact]
    public async Task HandleAsync_UrlWithQueryAndFragment_StoresOnlySchemeHostAndPath()
    {
        Mock<IUserContext> userContextMock = new();
        userContextMock.Setup(x => x.UserId).Returns((string?)null);

        CreateFeedbackSubmission.Request request = new()
        {
            Type = CreateFeedbackSubmission.ReportIssueType,
            CurrentUrl = "https://www.quizymode.com/study/abc?token=synthetic-secret&q=x#section=synthetic",
            Details = "Broken page"
        };

        Result<CreateFeedbackSubmission.Response> result = await CreateFeedbackSubmission.HandleAsync(
            request,
            DbContext,
            userContextMock.Object,
            new DefaultHttpContext(),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.CurrentUrl.Should().Be("https://www.quizymode.com/study/abc");
        DbContext.FeedbackSubmissions.Single().PageUrl.Should().Be("https://www.quizymode.com/study/abc");
    }

    [Theory]
    [InlineData("https://www.quizymode.com/categories/aws", "https://www.quizymode.com/categories/aws")]
    [InlineData("  https://www.quizymode.com/collections  ", "https://www.quizymode.com/collections")]
    [InlineData("https://www.quizymode.com/?utm_source=synthetic", "https://www.quizymode.com/")]
    [InlineData("https://www.quizymode.com/a/b#frag", "https://www.quizymode.com/a/b")]
    [InlineData("http://localhost:7000/collections?x=1", "http://localhost:7000/collections")]
    [InlineData("https://user:pass@www.quizymode.com/a?x=1", "https://www.quizymode.com/a")]
    public void MinimizePageUrl_RemovesQueryFragmentAndCredentials(string input, string expected)
    {
        CreateFeedbackSubmission.MinimizePageUrl(input.Trim()).Should().Be(expected);
    }

    [Fact]
    public void Validator_InvalidUrl_ReturnsValidationError()
    {
        CreateFeedbackSubmission.Validator validator = new();
        CreateFeedbackSubmission.Request request = new()
        {
            Type = CreateFeedbackSubmission.ReportIssueType,
            CurrentUrl = "/relative/path",
            Details = "Broken page",
            Email = "not-an-email"
        };

        FluentValidation.Results.ValidationResult result = validator.Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.PropertyName == "CurrentUrl");
        result.Errors.Should().Contain(error => error.PropertyName == "Email");
    }
}
