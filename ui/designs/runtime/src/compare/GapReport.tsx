import type { ComparisonReport } from "./types.ts";

interface GapReportProps {
  report: ComparisonReport;
}

export function GapReport({ report }: GapReportProps) {
  const { metrics } = report;
  const severity =
    metrics.diffPercentage < 1
      ? "match"
      : metrics.diffPercentage < 5
        ? "close"
        : "divergent";
  const severityColor = {
    match: "text-emerald-700",
    close: "text-amber-700",
    divergent: "text-rose-700",
  }[severity];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Gap Report</h3>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Diff Pixels
          </p>
          <p className={`mt-1 text-2xl font-bold ${severityColor}`}>
            {metrics.diffPercentage.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.diffPixels.toLocaleString()} /{" "}
            {metrics.totalPixels.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Color Channels
          </p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-red-600">R</span>
              <span>{metrics.channels.r.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600">G</span>
              <span>{metrics.channels.g.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600">B</span>
              <span>{metrics.channels.b.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
          </p>
          <p className={`mt-1 text-lg font-semibold ${severityColor}`}>
            {severity === "match"
              ? "Match"
              : severity === "close"
                ? "Close"
                : "Divergent"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-medium text-slate-700">
          Spatial Analysis (3x3 Grid)
        </h4>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {metrics.grid.map((cell) => {
            const isClean = cell.diffPercentage === 0;
            return (
              <div
                key={`${cell.row}-${cell.col}`}
                className={`rounded p-2 text-center text-xs ${
                  isClean
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {cell.diffPercentage.toFixed(1)}%
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Grid shows diff concentration by region — highlights layout and
          spacing differences.
        </p>
      </div>
    </section>
  );
}
