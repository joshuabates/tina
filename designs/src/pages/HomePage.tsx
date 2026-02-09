import { Link } from "react-router-dom";
import { PageFrame } from "../components/PageFrame";
import { listDesignSets } from "../designSets/registry";

export function HomePage() {
  const sets = listDesignSets();

  return (
    <PageFrame
      title="Interactive Mockup Sets"
      subtitle="Browse wireframes and design explorations. Add more sets in src/designSets/<slug>."
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sets.map((set) => (
          <article key={set.slug} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{set.title}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                {set.phase}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{set.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {set.tags.map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {tag}
                </span>
              ))}
            </div>
            <Link
              to={`/sets/${set.slug}`}
              className="mt-4 inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
            >
              Open set
            </Link>
          </article>
        ))}
      </section>
    </PageFrame>
  );
}

