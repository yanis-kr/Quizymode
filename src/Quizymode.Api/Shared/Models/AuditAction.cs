namespace Quizymode.Api.Shared.Models;

public enum AuditAction
{
    UserCreated,
    LoginSuccess,
    LoginFailed,
    Logout,
    CommentCreated,
    CommentDeleted,
    ItemCreated,
    ItemUpdated,
    ItemDeleted
}

