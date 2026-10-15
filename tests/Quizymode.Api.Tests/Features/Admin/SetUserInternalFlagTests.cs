using FluentAssertions;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Quizymode.Api.Data;
using Quizymode.Api.Features.Admin;
using Quizymode.Api.Services;
using Quizymode.Api.Shared.Kernel;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Tests.TestFixtures;
using Xunit;

namespace Quizymode.Api.Tests.Features.Admin;

public sealed class SetUserInternalFlagTests : DatabaseTestFixture
{
    private readonly Mock<IUserContext> _userContextMock = new();
    private readonly Mock<IAuditService> _auditServiceMock = new();
    private readonly Guid _adminId = Guid.NewGuid();

    public SetUserInternalFlagTests()
    {
        _userContextMock.SetupGet(context => context.IsAuthenticated).Returns(true);
        _userContextMock.SetupGet(context => context.IsAdmin).Returns(true);
        _userContextMock.SetupGet(context => context.UserId).Returns(_adminId.ToString());
    }

    private Task<Result<SetUserInternalFlag.Response>> Run(string id, bool? isInternal) =>
        SetUserInternalFlag.HandleAsync(
            id,
            new SetUserInternalFlag.Request(isInternal),
            DbContext,
            _userContextMock.Object,
            _auditServiceMock.Object,
            CancellationToken.None);

    [Fact]
    public async Task HandleAsync_FlagsAndUnflagsUser_AndAuditsEachChange()
    {
        Guid userId = Guid.NewGuid();
        DbContext.Users.Add(new User { Id = userId, Subject = "subject-tester" });
        await DbContext.SaveChangesAsync();

        Result<SetUserInternalFlag.Response> flagged = await Run(userId.ToString(), true);
        Result<SetUserInternalFlag.Response> repeated = await Run(userId.ToString(), true);

        flagged.IsSuccess.Should().BeTrue();
        flagged.Value!.IsInternal.Should().BeTrue();
        repeated.Value!.IsInternal.Should().BeTrue();
        (await DbContext.Users.FindAsync(userId))!.IsInternal.Should().BeTrue();

        Result<SetUserInternalFlag.Response> unflagged = await Run(userId.ToString(), false);

        unflagged.Value!.IsInternal.Should().BeFalse();
        (await DbContext.Users.FindAsync(userId))!.IsInternal.Should().BeFalse();

        // A no-op repeat does not write a second audit row.
        _auditServiceMock.Verify(
            audit => audit.LogAsync(
                AuditAction.UserInternalFlagChanged,
                _adminId,
                userId,
                It.IsAny<Dictionary<string, string>?>(),
                It.IsAny<CancellationToken>()),
            Times.Exactly(2));
    }

    [Fact]
    public async Task HandleAsync_UnknownUser_ReturnsNotFound()
    {
        Result<SetUserInternalFlag.Response> result = await Run(Guid.NewGuid().ToString(), true);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.NotFound);
    }

    [Fact]
    public async Task HandleAsync_InvalidUserId_ReturnsValidationError()
    {
        Result<SetUserInternalFlag.Response> result = await Run("not-a-guid", true);

        result.IsFailure.Should().BeTrue();
        result.Error.Type.Should().Be(ErrorType.Validation);
    }

    [Fact]
    public void Validator_RequiresIsInternal()
    {
        SetUserInternalFlag.Validator validator = new();

        validator.Validate(new SetUserInternalFlag.Request(null)).IsValid.Should().BeFalse();
        validator.Validate(new SetUserInternalFlag.Request(false)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Endpoint_RequiresAdminPolicy_SoNonAdminsGet403()
    {
        WebApplicationBuilder builder = WebApplication.CreateBuilder();
        builder.Services.AddScoped<IValidator<SetUserInternalFlag.Request>, SetUserInternalFlag.Validator>();
        builder.Services.AddScoped<ApplicationDbContext>(_ => DbContext);
        builder.Services.AddSingleton(_userContextMock.Object);
        builder.Services.AddSingleton(_auditServiceMock.Object);
        WebApplication app = builder.Build();

        new SetUserInternalFlag.Endpoint().MapEndpoint(app);

        RouteEndpoint endpoint = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Single(candidate => candidate.RoutePattern.RawText == "admin/users/{id}/internal");

        endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
            .Should().Contain(data => data.Policy == "Admin");
        endpoint.Metadata.GetMetadata<IAllowAnonymous>().Should().BeNull();
    }
}
