import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame.tsx";
import { listDesigns } from "../registry/index.ts";

export function HomePage() {
  const designs = listDesigns();

  return (
    <PageFrame
      title="Design Explorations"
      subtitle="Browse wireframes and design variations. Add more designs in sets/<design-slug>/<variation-slug>/."
    >
      {designs.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          No designs found. Create a design by adding a directory under{" "}
          <code>ui/designs/sets/&lt;design-slug&gt;/&lt;variation-slug&gt;/</code>{" "}
          with <code>meta.ts</code> and <code>index.tsx</code>.
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {designs.map((design) => (
          <article
            key={design.slug}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {design.title}
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {design.variations.length}{" "}
                {design.variations.length === 1 ? "variation" : "variations"}
              </span>
            </div>
            {design.prompt ? (
              <p className="mt-2 text-sm text-slate-600">{design.prompt}</p>
            ) : null}
            {design.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {design.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <Link
              to={`/designs/${design.slug}`}
              className="mt-4 inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
            >
              Open design
            </Link>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}
