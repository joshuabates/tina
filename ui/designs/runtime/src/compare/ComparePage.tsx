import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageFrame } from "../components/PageFrame.tsx";
import { GapReport } from "./GapReport.tsx";
import type { ComparisonManifest, ComparisonReport } from "./types.ts";

type ViewMode = "side-by-side" | "diff" | "overlay";

export function ComparePage() {
  const { designSlug = "", variationSlug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manifest, setManifest] = useState<ComparisonManifest | null>(null);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [error, setError] = useState("");

  const activePreset =
    searchParams.get("preset") ?? manifest?.presets[0]?.name ?? "";

  useEffect(() => {
    fetch(`/screenshots/${designSlug}/${variationSlug}/manifest.json`)
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(new Error("No comparison data found")),
      )
      .then((data: ComparisonManifest) => setManifest(data))
      .catch((err: Error) => setError(err.message));
  }, [designSlug, variationSlug]);

  useEffect(() => {
    if (!activePreset) return;
    fetch(
      `/screenshots/${designSlug}/${variationSlug}/${activePreset}/report.json`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ComparisonReport | null) => setReport(data))
      .catch(() => setReport(null));
  }, [designSlug, variationSlug, activePreset]);

  const screenshotBase = `/screenshots/${designSlug}/${variationSlug}/${activePreset}`;

  if (error) {
    return (
      <PageFrame
        title="Compare"
        subtitle="No comparison data available"
        actions={
          <Link
            to={`/designs/${designSlug}/${variationSlug}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Back to design
          </Link>
        }
      >
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {error}. Run{" "}
          <code>
            npm run compare -- --design {designSlug} --variation{" "}
            {variationSlug} --story &lt;story-id&gt;
          </code>{" "}
          to generate comparison data.
        </section>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title="Compare"
      subtitle={`${designSlug} / ${variationSlug}`}
      actions={
        <Link
          to={`/designs/${designSlug}/${variationSlug}`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          Back to design
        </Link>
      }
    >
      {manifest && manifest.presets.length > 1 ? (
        <nav className="flex gap-2">
          {manifest.presets.map((p) => (
            <button
              key={p.name}
              onClick={() => setSearchParams({ preset: p.name })}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                p.name === activePreset
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700 hover:border-slate-500"
              }`}
            >
              {p.name} ({p.width}x{p.height})
            </button>
          ))}
        </nav>
      ) : null}

      <nav className="flex gap-2">
        {(["side-by-side", "diff", "overlay"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              mode === viewMode
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 text-slate-700 hover:border-slate-500"
            }`}
          >
            {mode === "side-by-side"
              ? "Side by Side"
              : mode === "diff"
                ? "Diff"
                : "Overlay"}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        {viewMode === "side-by-side" ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Design
              </h3>
              <img
                src={`${screenshotBase}/design.png`}
                alt="Design screenshot"
                className="w-full rounded border border-slate-200"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-600">
                Storybook
              </h3>
              <img
                src={`${screenshotBase}/storybook.png`}
                alt="Storybook screenshot"
                className="w-full rounded border border-slate-200"
              />
            </div>
          </div>
        ) : viewMode === "diff" ? (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-600">
              Pixel Diff
            </h3>
            <img
              src={`${screenshotBase}/diff.png`}
              alt="Diff overlay"
              className="w-full rounded border border-slate-200"
            />
          </div>
        ) : (
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-600">
              Overlay (Design + Diff)
            </h3>
            <div className="relative">
              <img
                src={`${screenshotBase}/design.png`}
                alt="Design screenshot"
                className="w-full rounded border border-slate-200"
              />
              <img
                src={`${screenshotBase}/diff.png`}
                alt="Diff overlay"
                className="absolute inset-0 w-full rounded opacity-50 mix-blend-multiply"
              />
            </div>
          </div>
        )}
      </section>

      {report ? <GapReport report={report} /> : null}
    </PageFrame>
  );
}
