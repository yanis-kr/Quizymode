import type { SessionDepthBucket } from "@/api/admin";
import { OUTCOME_BAR_CLASSES } from "./sessionFormatting";

interface DepthHistogramProps {
  buckets: SessionDepthBucket[];
  totalSessions: number;
}

/**
 * How deep visitors got before leaving. The first bar is the bounce bar — if it
 * dominates, visitors are landing and leaving rather than exploring.
 */
const DepthHistogram = ({ buckets, totalSessions }: DepthHistogramProps) => {
  const maxBucket = Math.max(...buckets.map((bucket) => bucket.totalSessions), 0);

  if (totalSessions === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No sessions recorded in this range yet.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {buckets.map((bucket) => {
        const widthPercent =
          maxBucket === 0 ? 0 : (bucket.totalSessions / maxBucket) * 100;
        const sharePercent = Math.round(
          (bucket.totalSessions / totalSessions) * 100
        );

        return (
          <div key={bucket.label}>
            <div className="flex items-center justify-between text-sm text-slate-700">
              <span className="font-medium">{bucket.label}</span>
              <span>
                {bucket.totalSessions} sessions ({sharePercent}%)
              </span>
            </div>

            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-3" style={{ width: `${widthPercent}%` }}>
                <OutcomeSegment
                  count={bucket.anonymousSessions}
                  total={bucket.totalSessions}
                  colorClass={OUTCOME_BAR_CLASSES.anonymous}
                />
                <OutcomeSegment
                  count={bucket.convertedSessions}
                  total={bucket.totalSessions}
                  colorClass={OUTCOME_BAR_CLASSES.converted}
                />
                <OutcomeSegment
                  count={bucket.authenticatedSessions}
                  total={bucket.totalSessions}
                  colorClass={OUTCOME_BAR_CLASSES.authenticated}
                />
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-600">
        <LegendSwatch
          colorClass={OUTCOME_BAR_CLASSES.anonymous}
          label="Anonymous"
        />
        <LegendSwatch
          colorClass={OUTCOME_BAR_CLASSES.converted}
          label="Converted"
        />
        <LegendSwatch
          colorClass={OUTCOME_BAR_CLASSES.authenticated}
          label="Authenticated"
        />
      </div>
    </div>
  );
};

interface OutcomeSegmentProps {
  count: number;
  total: number;
  colorClass: string;
}

const OutcomeSegment = ({ count, total, colorClass }: OutcomeSegmentProps) => {
  if (count === 0 || total === 0) {
    return null;
  }

  return (
    <div className={colorClass} style={{ width: `${(count / total) * 100}%` }} />
  );
};

const LegendSwatch = ({
  colorClass,
  label,
}: {
  colorClass: string;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
    {label}
  </span>
);

export default DepthHistogram;
