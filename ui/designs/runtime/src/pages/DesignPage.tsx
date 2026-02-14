import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageFrame } from "../components/PageFrame.tsx";
import {
  findDesign,
  findVariation,
  loadVariationComponent,
} from "../registry/index.ts";

export function DesignPage() {
  const { designSlug = "", variationSlug } = useParams();
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType | null>(
    null,
  );
  const [loadingSlug, setLoadingSlug] = useState("");
  const [errorSlug, setErrorSlug] = useState("");

  const design = findDesign(designSlug);
  const activeVariationSlug =
    variationSlug ?? design?.variations[0]?.slug ?? "";
  const activeVariation = findVariation(designSlug, activeVariationSlug);

  useEffect(() => {
    if (!designSlug || !activeVariationSlug) return;

    let active = true;
    setLoadingSlug(`${designSlug}/${activeVariationSlug}`);
    setErrorSlug("");
    setLoadedComponent(null);

    loadVariationComponent(designSlug, activeVariationSlug).then(
      (component) => {
        if (!active) return;
        setLoadingSlug("");
        if (component) {
          setLoadedComponent(() => component);
        } else {
          setErrorSlug(`${designSlug}/${activeVariationSlug}`);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [designSlug, activeVariationSlug]);

  if (!design) {
    return (
      <PageFrame
        title="Design not found"
        subtitle={`No design found with slug "${designSlug}".`}
        actions={
          <Link
            to="/"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Back to index
          </Link>
        }
      >
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Create a design by adding directories under{" "}
          <code>
            ui/designs/sets/&lt;design-slug&gt;/&lt;variation-slug&gt;/
          </code>{" "}
          with <code>meta.ts</code> and <code>index.tsx</code>.
        </section>
      </PageFrame>
    );
  }

  const isLoading = loadingSlug === `${designSlug}/${activeVariationSlug}`;
  const hasError = errorSlug === `${designSlug}/${activeVariationSlug}`;

  return (
    <PageFrame
      title={design.title}
      subtitle={design.prompt}
      actions={
        <div className="flex gap-2">
          <Link
            to={`/compare/${designSlug}/${activeVariationSlug}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-500"
          >
            Compare
          </Link>
          <Link
            to="/"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            Back to index
          </Link>
        </div>
      }
    >
      {design.variations.length > 1 ? (
        <nav className="flex flex-wrap gap-2">
          {design.variations.map((v) => (
            <Link
              key={v.slug}
              to={`/designs/${designSlug}/${v.slug}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                v.slug === activeVariationSlug
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700 hover:border-slate-500"
              }`}
            >
              {v.title}
              {v.status ? (
                <span className="ml-1.5 text-xs opacity-60">{v.status}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : null}

      {activeVariation?.description ? (
        <p className="text-sm text-slate-600">{activeVariation.description}</p>
      ) : null}

      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading variation...
        </section>
      ) : null}

      {hasError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Could not load this variation component.
        </section>
      ) : null}

      {!isLoading && !hasError && LoadedComponent ? (
        <LoadedComponent />
      ) : null}
    </PageFrame>
  );
}
