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
