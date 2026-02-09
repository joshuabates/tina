import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { findDesignSet, loadDesignSetComponent } from "../designSets/registry";

export function DesignSetPage() {
  const { setSlug = "" } = useParams();
  const [loadedSlug, setLoadedSlug] = useState("");
  const [missingSlug, setMissingSlug] = useState("");
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(null);

  const meta = findDesignSet(setSlug);

  useEffect(() => {
    let active = true;

    loadDesignSetComponent(setSlug).then((component) => {
      if (!active) {
        return;
      }

      setLoadedSlug(setSlug);
      setMissingSlug(component ? "" : setSlug);
      setLoadedComponent(component ? () => component : null);
    });

    return () => {
      active = false;
    };
  }, [setSlug]);

  if (!meta) {
    return (
      <PageFrame
        title="Design set not found"
        subtitle="The requested set slug does not exist in src/designSets/."
        actions={
          <Link to="/" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
            Back to index
          </Link>
        }
      >
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Add a folder in <code>src/designSets/&lt;slug&gt;</code> with <code>meta.ts</code>, <code>data.ts</code>,
          and <code>index.tsx</code>.
        </section>
      </PageFrame>
    );
  }

  const isLoading = loadedSlug !== setSlug;
  const isMissing = loadedSlug === setSlug && missingSlug === setSlug;

  return (
    <PageFrame
      title={meta.title}
      subtitle={meta.description}
      actions={
        <>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
            {meta.phase}
          </span>
          <Link to="/" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
            Back to index
          </Link>
        </>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading set…</section>
      ) : null}
      {isMissing ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Could not load this set component.
        </section>
      ) : null}
      {!isLoading && !isMissing && LoadedComponent ? <LoadedComponent /> : null}
    </PageFrame>
  );
}

