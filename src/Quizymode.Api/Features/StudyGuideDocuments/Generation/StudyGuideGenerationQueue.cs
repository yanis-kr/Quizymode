using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Quizymode.Api.Data;
using Quizymode.Api.Shared.Models;
using Quizymode.Api.Shared.Options;

namespace Quizymode.Api.Features.StudyGuideDocuments.Generation;

/// <summary>
/// The Postgres-backed generation queue (AC 6.6). A job is due when it is Pending and its <c>NotBeforeUtc</c> has passed,
/// or Processing with an expired lease (a worker crashed mid-job). Claiming atomically moves due jobs to Processing with a
/// fresh lease and increments <c>Attempts</c>; premium jobs are claimed first. On PostgreSQL this is one
/// <c>UPDATE … WHERE Id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING</c> statement so concurrent API instances never claim
/// the same job; other providers (the SQLite test database) use a conditional per-row update.
/// </summary>
internal sealed class StudyGuideGenerationQueue(
    ApplicationDbContext db,
    IOptions<StudyGuideGenerationOptions> options,
    TimeProvider timeProvider)
{
    private readonly ApplicationDbContext _db = db;
    private readonly StudyGuideGenerationOptions _options = options.Value;
    private readonly TimeProvider _timeProvider = timeProvider;

    public async Task<List<Guid>> ClaimDueAsync(int maxJobs, CancellationToken cancellationToken)
    {
        DateTime now = _timeProvider.GetUtcNow().UtcDateTime;
        DateTime leaseUntil = now.AddMinutes(Math.Max(1, _options.LeaseMinutes));
        int limit = Math.Max(1, maxJobs);

        if (_db.Database.IsNpgsql())
        {
            return await _db.Database.SqlQuery<Guid>($"""
                UPDATE "SectionGenerations" AS g
                SET "Status" = {(int)SectionGenerationStatus.Processing},
                    "LeaseUntilUtc" = {leaseUntil},
                    "Attempts" = g."Attempts" + 1
                WHERE g."Id" IN (
                    SELECT c."Id" FROM "SectionGenerations" AS c
                    WHERE (c."Status" = {(int)SectionGenerationStatus.Pending} AND c."NotBeforeUtc" <= {now})
                       OR (c."Status" = {(int)SectionGenerationStatus.Processing} AND c."LeaseUntilUtc" < {now})
                    ORDER BY c."Tier" DESC, c."NotBeforeUtc"
                    LIMIT {limit}
                    FOR UPDATE SKIP LOCKED)
                RETURNING g."Id" AS "Value"
                """).ToListAsync(cancellationToken);
        }

        List<Guid> candidates = await _db.SectionGenerations
            .AsNoTracking()
            .Where(generation =>
                (generation.Status == SectionGenerationStatus.Pending && generation.NotBeforeUtc <= now) ||
                (generation.Status == SectionGenerationStatus.Processing && generation.LeaseUntilUtc < now))
            .OrderByDescending(generation => generation.Tier)
            .ThenBy(generation => generation.NotBeforeUtc)
            .Select(generation => generation.Id)
            .Take(limit * 4)
            .ToListAsync(cancellationToken);

        List<Guid> claimed = [];
        foreach (Guid id in candidates)
        {
            if (claimed.Count >= limit)
            {
                break;
            }

            int updated = await _db.SectionGenerations
                .Where(generation => generation.Id == id &&
                    ((generation.Status == SectionGenerationStatus.Pending && generation.NotBeforeUtc <= now) ||
                     (generation.Status == SectionGenerationStatus.Processing && generation.LeaseUntilUtc < now)))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(generation => generation.Status, SectionGenerationStatus.Processing)
                    .SetProperty(generation => generation.LeaseUntilUtc, leaseUntil)
                    .SetProperty(generation => generation.Attempts, generation => generation.Attempts + 1),
                    cancellationToken);
            if (updated == 1)
            {
                claimed.Add(id);
            }
        }

        return claimed;
    }
}
