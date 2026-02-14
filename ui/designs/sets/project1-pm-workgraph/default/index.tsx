import { useMemo, useState } from "react";
import {
  commentFeed,
  designRecords,
  metrics,
  projectOptions,
  ticketRecords,
  workflowStages,
  type DesignRecord,
  type DesignStatus,
  type TicketPriority,
  type TicketStatus,
} from "./data";

type DataState = "normal" | "loading" | "empty" | "error";
type LayoutOptionId = "option-a" | "option-b" | "option-c";

type SidebarMode = "expanded-tree" | "compact-rail";
type PrimaryTable = "tickets" | "designs";

const layoutOptions: Array<{ id: LayoutOptionId; label: string; summary: string }> = [
  {
    id: "option-a",
    label: "Option A",
    summary: "Three-pane command center: design queue, focused workspace, ticket/comment sidecar.",
  },
  {
    id: "option-b",
    label: "Option B",
    summary: "Selected direction: project-scoped shell with Tina-web-like sidebar grouping.",
  },
  {
    id: "option-c",
    label: "Option C",
    summary: "Workflow timeline: capture -> shape -> execute -> handoff.",
  },
];

const dataStates: DataState[] = ["normal", "loading", "empty", "error"];

function statusTone(status: DesignStatus | TicketStatus): string {
  if (status === "blocked") return "bg-slate-900 text-white";
  if (status === "approved" || status === "done") return "bg-slate-300 text-slate-900";
  if (status === "in_review" || status === "in_progress") return "bg-slate-200 text-slate-800";
  return "bg-slate-100 text-slate-700";
}

function priorityTone(priority: TicketPriority): string {
  if (priority === "urgent") return "bg-slate-900 text-white";
  if (priority === "high") return "bg-slate-300 text-slate-900";
  if (priority === "medium") return "bg-slate-200 text-slate-800";
  return "bg-slate-100 text-slate-700";
}

function MetricStrip() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</p>
          <p className="mt-1 text-xs text-slate-600">{metric.note}</p>
        </article>
      ))}
    </section>
  );
}

function EmptyOrErrorState({ state }: { state: DataState }) {
  if (state === "loading") {
    return (
      <section className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-600">
        Loading PM records...
      </section>
    );
  }
  if (state === "error") {
    return (
      <section className="rounded-xl border border-slate-400 bg-slate-100 p-4 text-sm text-slate-700">
        Failed to load data from helper APIs.
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
      No records match current filters.
    </section>
  );
}

function OptionA({ designs }: { designs: DesignRecord[] }) {
  const selected = designs[0] ?? null;
  const scopedTickets = ticketRecords.filter((ticket) => ticket.designKey === selected?.key);
  const scopedComments = commentFeed.filter((comment) => comment.targetKey === selected?.key);

  return (
    <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <article className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Design queue</p>
        <ul className="mt-2 space-y-2">
          {designs.map((design) => (
            <li key={design.id} className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-800">{design.key}</p>
              <p className="mt-1 text-[11px] text-slate-600">{design.title}</p>
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-xl border border-slate-300 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Selected design</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">{selected ? `${selected.key} - ${selected.title}` : "None"}</h3>
        <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-700">
          tina-session work design resolve --design-id {selected?.id ?? "<design-id>"}
        </p>
      </article>

      <aside className="space-y-4">
        <article className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tickets for design</p>
          <ul className="mt-2 space-y-2">
            {scopedTickets.map((ticket) => (
              <li key={ticket.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-semibold text-slate-800">{ticket.key}</p>
                <p className="mt-1 text-[11px] text-slate-700">{ticket.title}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Comments</p>
          <ul className="mt-2 space-y-2">
            {scopedComments.map((comment) => (
              <li key={comment.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="text-[11px] text-slate-700">{comment.body}</p>
              </li>
            ))}
          </ul>
        </article>
      </aside>
    </section>
  );
}

function OptionB({ query }: { query: string }) {
  const projects = useMemo(() => {
    return Array.from(
      new Set([...designRecords.map((design) => design.project), ...ticketRecords.map((ticket) => ticket.project)]),
    ).sort((a, b) => a.localeCompare(b));
  }, []);

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded-tree");
  const [primaryTable, setPrimaryTable] = useState<PrimaryTable>("tickets");
  const [activeProject, setActiveProject] = useState<string>(projects[0] ?? "");

  const q = query.trim().toLowerCase();

  const projectDesigns = useMemo(() => {
    return designRecords.filter((design) => {
      if (design.project !== activeProject) return false;
      if (!q) return true;
      return design.key.toLowerCase().includes(q) || design.title.toLowerCase().includes(q);
    });
  }, [activeProject, q]);

  const projectTickets = useMemo(() => {
    return ticketRecords.filter((ticket) => {
      if (ticket.project !== activeProject) return false;
      if (!q) return true;
      return ticket.key.toLowerCase().includes(q) || ticket.title.toLowerCase().includes(q);
    });
  }, [activeProject, q]);

  const handoffDesign = projectDesigns.find((design) => design.orchestrationReady) ?? projectDesigns[0] ?? null;

  const summary = {
    designs: designRecords.filter((design) => design.project === activeProject).length,
    tickets: ticketRecords.filter((ticket) => ticket.project === activeProject).length,
    blocked: ticketRecords.filter((ticket) => ticket.project === activeProject && ticket.status === "blocked").length,
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_320px]">
      <aside className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sidebar pattern</p>
        <p className="mt-1 text-[11px] text-slate-600">Mirror Tina-web project grouping with entity rows.</p>
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={() => setSidebarMode("expanded-tree")}
            className={[
              "rounded border px-2 py-1 text-xs",
              sidebarMode === "expanded-tree"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-slate-50 text-slate-700",
            ].join(" ")}
          >
            Expanded tree
          </button>
          <button
            type="button"
            onClick={() => setSidebarMode("compact-rail")}
            className={[
              "rounded border px-2 py-1 text-xs",
              sidebarMode === "compact-rail"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-slate-50 text-slate-700",
            ].join(" ")}
          >
            Compact rail
          </button>
        </div>

        {sidebarMode === "expanded-tree" ? (
          <ul className="mt-3 space-y-3">
            {projects.map((project) => {
              const selected = project === activeProject;
              const ticketCount = ticketRecords.filter((ticket) => ticket.project === project).length;
              const designCount = designRecords.filter((design) => design.project === project).length;
              const ticketRowSelected = selected && primaryTable === "tickets";
              const designRowSelected = selected && primaryTable === "designs";

              return (
                <li key={project}>
                  <article className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveProject(project)}
                        className={[
                          "rounded px-1 py-0.5 text-left text-xs font-semibold",
                          selected ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-200",
                        ].join(" ")}
                      >
                        {project}
                      </button>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600">{ticketCount + designCount}</span>
                    </div>

                    <ul className="space-y-1">
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProject(project);
                            setPrimaryTable("tickets");
                          }}
                          className={[
                            "w-full rounded border px-2 py-1.5 text-left",
                            ticketRowSelected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700",
                          ].join(" ")}
                        >
                          <p className="text-[11px] font-semibold">Tickets</p>
                          <p className="text-[10px]">{ticketCount} items</p>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProject(project);
                            setPrimaryTable("designs");
                          }}
                          className={[
                            "w-full rounded border px-2 py-1.5 text-left",
                            designRowSelected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700",
                          ].join(" ")}
                        >
                          <p className="text-[11px] font-semibold">Designs</p>
                          <p className="text-[10px]">{designCount} items</p>
                        </button>
                      </li>
                    </ul>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {projects.map((project) => {
                const selected = project === activeProject;
                const initials = project
                  .split("-")
                  .map((part) => part[0]?.toUpperCase())
                  .join("")
                  .slice(0, 3);
                return (
                  <li key={project}>
                    <button
                      type="button"
                      title={project}
                      onClick={() => setActiveProject(project)}
                      className={[
                        "h-12 w-full rounded border text-xs font-semibold",
                        selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700",
                      ].join(" ")}
                    >
                      {initials}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current project entity</p>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setPrimaryTable("tickets")}
                  className={[
                    "rounded border px-2 py-1 text-xs",
                    primaryTable === "tickets"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700",
                  ].join(" ")}
                >
                  Tickets
                </button>
                <button
                  type="button"
                  onClick={() => setPrimaryTable("designs")}
                  className={[
                    "rounded border px-2 py-1 text-xs",
                    primaryTable === "designs"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700",
                  ].join(" ")}
                >
                  Designs
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      <article className="rounded-xl border border-slate-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project workspace</p>
            <p className="text-sm font-semibold text-slate-900">{activeProject}</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPrimaryTable("tickets")}
              className={[
                "rounded border px-2 py-1 text-xs",
                primaryTable === "tickets"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-700",
              ].join(" ")}
            >
              Ticket table
            </button>
            <button
              type="button"
              onClick={() => setPrimaryTable("designs")}
              className={[
                "rounded border px-2 py-1 text-xs",
                primaryTable === "designs"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-slate-50 text-slate-700",
              ].join(" ")}
            >
              Design table
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {primaryTable === "tickets" ? (
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Ticket</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Design link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{ticket.key}</p>
                      <p className="text-slate-600">{ticket.title}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={["rounded px-1.5 py-0.5 text-[10px]", statusTone(ticket.status)].join(" ")}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={["rounded px-1.5 py-0.5 text-[10px]", priorityTone(ticket.priority)].join(" ")}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{ticket.designKey ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Design</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Ready</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projectDesigns.map((design) => (
                  <tr key={design.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{design.key}</p>
                      <p className="text-slate-600">{design.title}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={["rounded px-1.5 py-0.5 text-[10px]", statusTone(design.status)].join(" ")}>
                        {design.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{design.owner}</td>
                    <td className="px-3 py-2 text-slate-600">{design.orchestrationReady ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </article>

      <aside className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project context</p>
        <div className="mt-2 space-y-2">
          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            {summary.designs} designs, {summary.tickets} tickets, {summary.blocked} blocked.
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            Handoff path: <span className="font-mono">/tina:orchestration --design-id {handoffDesign?.id ?? "..."}</span>
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Untriaged comments</p>
        <ul className="mt-2 space-y-2">
          {commentFeed
            .filter((comment) => comment.project === activeProject)
            .slice(0, 4)
            .map((comment) => (
              <li key={comment.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="text-[11px] text-slate-700">{comment.body}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {comment.targetKey} - {comment.createdAgo}
                </p>
              </li>
            ))}
        </ul>
      </aside>
    </section>
  );
}

function OptionC({ designs }: { designs: DesignRecord[] }) {
  const ready = designs.filter((design) => design.orchestrationReady).slice(0, 3);
  const blockedTickets = ticketRecords.filter((ticket) => ticket.status === "blocked");

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Workflow timeline</p>
        <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workflowStages.map((stage) => (
            <li key={stage.id} className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-800">{stage.label}</p>
              <p className="mt-1 text-[11px] text-slate-600">{stage.description}</p>
              <p className="mt-2 text-xs font-medium text-slate-700">{stage.count}</p>
            </li>
          ))}
        </ol>
      </article>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr_320px]">
        <article className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ready designs</p>
          <ul className="mt-2 space-y-2">
            {ready.map((design) => (
              <li key={design.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-semibold text-slate-800">{design.key}</p>
                <p className="mt-1 text-[11px] text-slate-700">{design.title}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Handoff checklist</p>
          <ul className="mt-2 space-y-2 text-xs">
            <li className="rounded border border-slate-200 bg-slate-50 px-2 py-2">1. Confirm design markdown is current in Convex</li>
            <li className="rounded border border-slate-200 bg-slate-50 px-2 py-2">2. Run helper resolve with designId</li>
            <li className="rounded border border-slate-200 bg-slate-50 px-2 py-2">3. Planner manually pulls latest design before phase plan</li>
            <li className="rounded border border-slate-200 bg-slate-50 px-2 py-2">4. Start orchestration from skill flow</li>
          </ul>
        </article>

        <aside className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Watchlist</p>
          <ul className="mt-2 space-y-2">
            {blockedTickets.map((ticket) => (
              <li key={ticket.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-semibold text-slate-800">{ticket.key}</p>
                <p className="mt-1 text-[11px] text-slate-700">{ticket.title}</p>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </section>
  );
}

export default function DesignSetScreen() {
  const [activeOption, setActiveOption] = useState<LayoutOptionId>("option-a");
  const [dataState, setDataState] = useState<DataState>("normal");
  const [projectFilter, setProjectFilter] = useState<(typeof projectOptions)[number]>("all");
  const [query, setQuery] = useState("");

  const filteredDesigns = useMemo(() => {
    if (dataState !== "normal") return [];
    return designRecords.filter((design) => {
      const matchesProject = projectFilter === "all" || design.project === projectFilter;
      const q = query.trim().toLowerCase();
      const matchesQuery = q.length === 0 || design.title.toLowerCase().includes(q) || design.key.toLowerCase().includes(q);
      return matchesProject && matchesQuery;
    });
  }, [dataState, projectFilter, query]);

  const option = layoutOptions.find((item) => item.id === activeOption) ?? layoutOptions[0];

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">wireframe exploration</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Project 1 PM UX options</h2>
          <p className="mt-1 text-sm text-slate-600">{option.summary}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label className="flex items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Design key or title"
              className="min-w-0 flex-1 border-none bg-transparent outline-none"
            />
          </label>

          {activeOption !== "option-b" ? (
            <label className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Project
              <select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value as (typeof projectOptions)[number])}
                className="ml-2 bg-transparent outline-none"
              >
                {projectOptions.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Project scope is selected from the left sidebar in Option B.
            </div>
          )}

          <label className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            State
            <select
              value={dataState}
              onChange={(event) => setDataState(event.target.value as DataState)}
              className="ml-2 bg-transparent outline-none"
            >
              {dataStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {layoutOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveOption(item.id)}
            className={[
              "rounded border px-3 py-1.5 text-sm",
              item.id === activeOption ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <MetricStrip />

      {dataState !== "normal" ? <EmptyOrErrorState state={dataState} /> : null}

      {dataState === "normal" && activeOption === "option-a" ? <OptionA designs={filteredDesigns} /> : null}
      {dataState === "normal" && activeOption === "option-b" ? <OptionB query={query} /> : null}
      {dataState === "normal" && activeOption === "option-c" ? <OptionC designs={filteredDesigns} /> : null}
    </div>
  );
}
