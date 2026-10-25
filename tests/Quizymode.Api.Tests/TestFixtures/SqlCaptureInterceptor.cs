using System.Collections.Concurrent;
using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Quizymode.Api.Tests.TestFixtures;

/// <summary>
/// Records every command text (reader, non-query and scalar, sync and async) and every transaction start
/// issued through a DbContext, so tests can assert that a code path took no row lock and no transaction.
/// </summary>
internal sealed class SqlCaptureInterceptor : DbCommandInterceptor, IDbTransactionInterceptor
{
    private readonly ConcurrentQueue<string> _commands = new();
    private int _transactionStarts;

    public IReadOnlyList<string> Commands => _commands.ToArray();

    public int TransactionStarts => Volatile.Read(ref _transactionStarts);

    public int Count(string fragment) =>
        _commands.Count(text => text.Contains(fragment, StringComparison.OrdinalIgnoreCase));

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Record(command);
        return result;
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Record(command);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        Record(command);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Record(command);
        return ValueTask.FromResult(result);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        Record(command);
        return result;
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result,
        CancellationToken cancellationToken = default)
    {
        Record(command);
        return ValueTask.FromResult(result);
    }

    public InterceptionResult<DbTransaction> TransactionStarting(
        DbConnection connection, TransactionStartingEventData eventData, InterceptionResult<DbTransaction> result)
    {
        Interlocked.Increment(ref _transactionStarts);
        return result;
    }

    public ValueTask<InterceptionResult<DbTransaction>> TransactionStartingAsync(
        DbConnection connection, TransactionStartingEventData eventData, InterceptionResult<DbTransaction> result,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _transactionStarts);
        return ValueTask.FromResult(result);
    }

    private void Record(DbCommand command) => _commands.Enqueue(command.CommandText);
}
