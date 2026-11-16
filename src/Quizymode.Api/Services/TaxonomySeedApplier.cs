using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;

namespace Quizymode.Api.Services;

/// <summary>
/// Applies the generated taxonomy seed SQL (about 2,300 upserts) only when the file changed (#732). The SHA-256 of the
/// file is kept in the one-row <see cref="TaxonomySeedState"/> table and written in the same transaction as the seed, so
/// a failed seed leaves the old hash and is retried on the next boot. The cost: manual edits to category rows are no
/// longer reverted on every boot; set <c>Taxonomy:ForceSeed=true</c> for one boot to revert them.
/// </summary>
internal static class TaxonomySeedApplier
{
    public static async Task<bool> ApplyIfChangedAsync(
        ApplicationDbContext db,
        string sqlPath,
        bool forceSeed,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        byte[] bytes = await File.ReadAllBytesAsync(sqlPath, cancellationToken);
        string hash = Convert.ToHexStringLower(SHA256.HashData(bytes));

        TaxonomySeedState? state = await db.TaxonomySeedStates
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == TaxonomySeedState.SingletonId, cancellationToken);

        if (!forceSeed && state is not null && string.Equals(state.Sha256, hash, StringComparison.Ordinal))
        {
            logger.LogInformation("Taxonomy seed SQL unchanged (sha256 {Sha256}); skipping.", hash);
            return false;
        }

        int bom = bytes is [0xEF, 0xBB, 0xBF, ..] ? 3 : 0;
        string sql = System.Text.Encoding.UTF8.GetString(bytes, bom, bytes.Length - bom);
        DbConnection connection = db.Database.GetDbConnection();
        bool shouldClose = connection.State != ConnectionState.Open;
        if (shouldClose)
        {
            await db.Database.OpenConnectionAsync(cancellationToken);
        }

        try
        {
            await using IDbContextTransaction transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await using (DbCommand command = connection.CreateCommand())
            {
                command.Transaction = transaction.GetDbTransaction();
                command.CommandText = sql;
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            TaxonomySeedState? tracked = await db.TaxonomySeedStates
                .SingleOrDefaultAsync(x => x.Id == TaxonomySeedState.SingletonId, cancellationToken);
            if (tracked is null)
            {
                db.TaxonomySeedStates.Add(new TaxonomySeedState { Sha256 = hash, AppliedUtc = DateTime.UtcNow });
            }
            else
            {
                tracked.Sha256 = hash;
                tracked.AppliedUtc = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        finally
        {
            if (shouldClose)
            {
                await db.Database.CloseConnectionAsync();
            }
        }

        logger.LogInformation("Taxonomy seed SQL applied. sha256={Sha256} forced={Forced}", hash, forceSeed);
        return true;
    }
}
