import { useMemo, useState } from "react";
import {
  authorTypeOptions,
  entryTypeOptions,
  feedbackEntriesSeed,
  feedbackTargets,
  orchestrationContext,
  type AuthorType,
  type EntryType,
  type FeedbackEntry,
  type FeedbackStatus,
  type FeedbackTarget,
  type TargetType,
  type ViewState,
} from "./data";

type LayoutOptionId = "option-a" | "option-b" | "option-c" | "option-d";

const layoutOptions: Array<{ id: LayoutOptionId; label: string; summary: string }> = [
  {
    id: "option-a",
    label: "Option A",
    summary: "Target-scoped quicklook with composer and RightPanel-style blocking summary.",
  },
  {
    id: "option-b",
    label: "Option B",
    summary: "Realtime orchestration stream first with detail sidecar for resolve and reopen.",
  },
  {
    id: "option-c",
    label: "Option C",
    summary: "Triage board: blocking lane, collaborative lane, and resolved lane.",
  },
  {
    id: "option-d",
    label: "Option D",
    summary: "Hybrid: quicklook composer + target feed with realtime stream and selected-event sidecar.",
  },
];

const entryTypeTone: Record<EntryType, string> = {
  comment: "border-slate-300 bg-slate-100 text-slate-700",
  suggestion: "border-sky-200 bg-sky-100 text-sky-700",
  ask_for_change: "border-rose-200 bg-rose-100 text-rose-700",
};

const statusTone: Record<FeedbackStatus, string> = {
  open: "border-amber-200 bg-amber-100 text-amber-800",
  resolved: "border-emerald-200 bg-emerald-100 text-emerald-800",
};

const authorTone: Record<AuthorType, string> = {
  human: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800",
  agent: "border-indigo-200 bg-indigo-100 text-indigo-800",
};

const targetTone: Record<TargetType, string> = {
  task: "border-cyan-200 bg-cyan-100 text-cyan-800",
  commit: "border-violet-200 bg-violet-100 text-violet-800",
};

const targetLookup = new Map(feedbackTargets.map((target) => [target.id, target]));

function cx(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

function targetKey(targetType: TargetType, targetRef: string): string {
  return `${targetType}:${targetRef}`;
}

function labelize(value: string): string {
  return value.replace(/_/g, " ");
}

function stateNotice(state: ViewState): { title: string; body: string; tone: string } | null {
  if (state === "loading") {
    return {
      title: "Loading feedback stream",
      body: "Convex query in flight. Keep compose and stream context visible while data hydrates.",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }

  if (state === "empty") {
    return {
      title: "No matching feedback",
      body: "No entries available in this scope yet. Keep compose available so users can still add first feedback.",
      tone: "border-slate-300 bg-white text-slate-700",
    };
  }

  if (state === "error") {
    return {
      title: "Feedback query failed",
      body: "Show explicit retry guidance and preserve filter state to avoid operator disorientation.",
      tone: "border-rose-200 bg-rose-50 text-rose-800",
    };
  }

  return null;
}

function OptionPills({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cx(
                "rounded-full border px-2.5 py-1 text-xs transition",
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
              )}
            >
              {labelize(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackCard({
  entry,
  selected,
  onSelect,
  onToggleStatus,
}: {
  entry: FeedbackEntry;
  selected?: boolean;
  onSelect?: (entryId: string) => void;
  onToggleStatus: (entryId: string) => void;
}) {
  const entryTarget = targetLookup.get(targetKey(entry.targetType, entry.targetRef));

  return (
    <article
      onClick={onSelect ? () => onSelect(entry.id) : undefined}
      className={cx(
        "rounded-2xl border bg-white p-3 shadow-sm transition",
        selected ? "border-slate-900 shadow" : "border-slate-200",
        onSelect ? "cursor-pointer hover:border-slate-400" : undefined,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", entryTypeTone[entry.entryType])}>
            {labelize(entry.entryType)}
          </span>
          <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", statusTone[entry.status])}>
            {entry.status}
          </span>
          <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", authorTone[entry.authorType])}>
            {entry.authorType}
          </span>
          <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", targetTone[entry.targetType])}>
            {entry.targetType}:{entry.targetRef}
          </span>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleStatus(entry.id);
          }}
          className={cx(
            "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
            entry.status === "open"
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:border-emerald-500"
              : "border-amber-300 bg-amber-100 text-amber-800 hover:border-amber-500",
          )}
        >
          {entry.status === "open" ? "Resolve" : "Reopen"}
        </button>
      </div>

      <p className="mt-2 text-sm leading-5 text-slate-800">{entry.body}</p>
      <p className="mt-2 text-xs text-slate-500">Target: {entryTarget ? entryTarget.title : `${entry.targetType} ${entry.targetRef}`}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        {entry.authorName} | created {entry.createdAgo} | updated {entry.updatedAgo}
      </p>
      {entry.status === "resolved" ? (
        <p className="mt-1 text-[11px] font-medium text-emerald-700">Resolved by {entry.resolvedBy ?? "unknown"} {entry.resolvedAgo ? `| ${entry.resolvedAgo}` : ""}</p>
      ) : null}
    </article>
  );
}

function FeedbackStateBanner({ state }: { state: ViewState }) {
  const notice = stateNotice(state);
  if (!notice) {
    return null;
  }

  return (
    <section className={cx("rounded-2xl border p-3 text-sm", notice.tone)}>
      <p className="font-semibold">{notice.title}</p>
      <p className="mt-1 text-xs">{notice.body}</p>
    </section>
  );
}

function OptionAQuicklook({
  state,
  targets,
  allEntries,
  selectedTarget,
  onSelectTarget,
  selectedTargetEntries,
  composerEntryType,
  setComposerEntryType,
  composerAuthorType,
  setComposerAuthorType,
  composerBody,
  setComposerBody,
  onCreate,
  onToggleStatus,
}: {
  state: ViewState;
  targets: FeedbackTarget[];
  allEntries: FeedbackEntry[];
  selectedTarget: FeedbackTarget | null;
  onSelectTarget: (targetId: string) => void;
  selectedTargetEntries: FeedbackEntry[];
  composerEntryType: EntryType;
  setComposerEntryType: (value: EntryType) => void;
  composerAuthorType: AuthorType;
  setComposerAuthorType: (value: AuthorType) => void;
  composerBody: string;
  setComposerBody: (value: string) => void;
  onCreate: () => void;
  onToggleStatus: (entryId: string) => void;
}) {
  const blocking = allEntries.filter((entry) => entry.status === "open" && entry.entryType === "ask_for_change");

  return (
    <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target scope</p>
        <p className="mt-1 text-[11px] text-slate-600">Mirror TaskQuicklook and CommitQuicklook target switching.</p>

        <ul className="mt-3 space-y-2">
          {targets.map((target) => {
            const scoped = allEntries.filter((entry) => targetKey(entry.targetType, entry.targetRef) === target.id);
            const openCount = scoped.filter((entry) => entry.status === "open").length;
            const blockingCount = scoped.filter(
              (entry) => entry.status === "open" && entry.entryType === "ask_for_change",
            ).length;
            const selected = target.id === selectedTarget?.id;

            return (
              <li key={target.id}>
                <button
                  type="button"
                  onClick={() => onSelectTarget(target.id)}
                  className={cx(
                    "w-full rounded-xl border px-3 py-2 text-left transition",
                    selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-800",
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                    {target.targetType}:{target.targetRef}
                  </p>
                  <p className="mt-1 text-xs leading-4">{target.title}</p>
                  <div className="mt-2 flex items-center gap-1 text-[10px]">
                    <span className={cx("rounded-full px-1.5 py-0.5", selected ? "bg-white/20" : "bg-white text-slate-700")}>{openCount} open</span>
                    <span className={cx("rounded-full px-1.5 py-0.5", selected ? "bg-rose-200/30" : "bg-rose-100 text-rose-700")}>{blockingCount} blocking</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Feedback composer</p>
              <p className="text-sm font-semibold text-slate-900">
                {selectedTarget ? `${selectedTarget.targetType}:${selectedTarget.targetRef}` : "Select target"}
              </p>
            </div>
            <button
              type="button"
              onClick={onCreate}
              className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              Add entry
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <OptionPills
              label="entry type"
              value={composerEntryType}
              options={entryTypeOptions}
              onChange={(next) => setComposerEntryType(next as EntryType)}
            />
            <OptionPills
              label="author type"
              value={composerAuthorType}
              options={authorTypeOptions}
              onChange={(next) => setComposerAuthorType(next as AuthorType)}
            />
          </div>

          <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Body</label>
          <textarea
            value={composerBody}
            onChange={(event) => setComposerBody(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target feed</p>
            <p className="text-xs text-slate-600">{selectedTargetEntries.length} entries</p>
          </div>

          <div className="mt-3 space-y-3">
            <FeedbackStateBanner state={state} />
            {state === "normal" && selectedTargetEntries.length === 0 ? (
              <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
                No feedback for this target yet.
              </section>
            ) : null}
            {state === "normal"
              ? selectedTargetEntries.map((entry) => (
                  <FeedbackCard key={entry.id} entry={entry} onToggleStatus={onToggleStatus} />
                ))
              : null}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">RightPanel blocking summary</p>
          <p className="mt-2 text-3xl font-semibold text-rose-900">{blocking.length}</p>
          <p className="text-sm text-rose-800">Open ask_for_change entries across orchestration.</p>

          <ul className="mt-3 space-y-2">
            {blocking.slice(0, 3).map((entry) => (
              <li key={entry.id} className="rounded-xl border border-rose-200 bg-white p-2 text-xs text-rose-900">
                <p className="font-semibold">{entry.targetType}:{entry.targetRef}</p>
                <p className="mt-1">{entry.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target context</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{selectedTarget?.title ?? "No target selected"}</p>
          <p className="mt-1 text-xs text-slate-600">Owner: {selectedTarget?.owner ?? "-"}</p>
          <p className="text-xs text-slate-600">State: {selectedTarget?.state ?? "-"}</p>
          <p className="text-xs text-slate-600">Updated: {selectedTarget?.updatedAgo ?? "-"}</p>
        </section>
      </aside>
    </section>
  );
}

function OptionBStream({
  state,
  entries,
  selectedEntryId,
  onSelectEntry,
  onToggleStatus,
}: {
  state: ViewState;
  entries: FeedbackEntry[];
  selectedEntryId: string;
  onSelectEntry: (entryId: string) => void;
  onToggleStatus: (entryId: string) => void;
}) {
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Realtime stream</p>
            <p className="text-sm text-slate-700">Single orchestration-scoped timeline with typed context chips.</p>
          </div>
          <p className="text-xs text-slate-500">Newest first</p>
        </div>

        <div className="mt-3 space-y-3">
          <FeedbackStateBanner state={state} />
          {state === "normal" && entries.length === 0 ? (
            <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
              No stream events available yet.
            </section>
          ) : null}

          {state === "normal" ? (
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {entries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className={cx(
                      "absolute -left-[22px] top-5 h-2.5 w-2.5 rounded-full border",
                      entry.entryType === "ask_for_change"
                        ? "border-rose-300 bg-rose-200"
                        : entry.entryType === "suggestion"
                        ? "border-sky-300 bg-sky-200"
                        : "border-slate-300 bg-slate-200",
                    )}
                  />
                  <FeedbackCard
                    entry={entry}
                    selected={selectedEntryId === entry.id}
                    onSelect={onSelectEntry}
                    onToggleStatus={onToggleStatus}
                  />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </article>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected event details</p>
          {selectedEntry ? (
            <>
              <p className="mt-2 text-sm font-semibold text-slate-900">{selectedEntry.targetType}:{selectedEntry.targetRef}</p>
              <p className="mt-1 text-xs text-slate-600">{selectedEntry.authorName} ({selectedEntry.authorType})</p>
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">{selectedEntry.body}</p>
              <button
                type="button"
                onClick={() => onToggleStatus(selectedEntry.id)}
                className={cx(
                  "mt-3 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  selectedEntry.status === "open"
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-amber-300 bg-amber-100 text-amber-800",
                )}
              >
                {selectedEntry.status === "open" ? "Resolve from sidecar" : "Reopen from sidecar"}
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Select a stream row to preview its context.</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Transition guidance</p>
          <ul className="mt-2 space-y-2 text-xs text-slate-700">
            <li className="rounded-lg border border-slate-200 bg-slate-50 p-2">Open ask_for_change stays visible as blocking signal only.</li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 p-2">Resolve must stamp actor + timestamp metadata.</li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 p-2">Reopen clears resolution metadata and restores blocking state.</li>
          </ul>
        </section>
      </aside>
    </section>
  );
}

function Lane({
  title,
  subtitle,
  tone,
  entries,
  state,
  onToggleStatus,
}: {
  title: string;
  subtitle: string;
  tone: string;
  entries: FeedbackEntry[];
  state: ViewState;
  onToggleStatus: (entryId: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={cx("rounded-xl border px-3 py-2", tone)}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">{title}</p>
        <p className="mt-1 text-xs">{subtitle}</p>
      </div>

      <div className="mt-3 space-y-2">
        {state === "normal" && entries.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">No entries in this lane.</section>
        ) : null}

        {state === "normal"
          ? entries.map((entry) => {
              const entryTarget = targetLookup.get(targetKey(entry.targetType, entry.targetRef));
              return (
                <section key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] font-semibold text-slate-700">{entry.targetType}:{entry.targetRef}</p>
                    <button
                      type="button"
                      onClick={() => onToggleStatus(entry.id)}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      {entry.status === "open" ? "Resolve" : "Reopen"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{entry.body}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{entryTarget ? entryTarget.title : `${entry.targetType} ${entry.targetRef}`}</p>
                </section>
              );
            })
          : null}
      </div>
    </article>
  );
}

function OptionCTriage({
  state,
  entries,
  onToggleStatus,
}: {
  state: ViewState;
  entries: FeedbackEntry[];
  onToggleStatus: (entryId: string) => void;
}) {
  const blocking = entries.filter((entry) => entry.status === "open" && entry.entryType === "ask_for_change");
  const collaboration = entries.filter((entry) => entry.status === "open" && entry.entryType !== "ask_for_change");
  const resolved = entries.filter((entry) => entry.status === "resolved");

  return (
    <section className="space-y-4">
      <FeedbackStateBanner state={state} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Lane
          title="Blocking lane"
          subtitle="Open ask_for_change that should surface in RightPanel badge"
          tone="border-rose-200 bg-rose-50 text-rose-800"
          entries={blocking}
          state={state}
          onToggleStatus={onToggleStatus}
        />
        <Lane
          title="Collaboration lane"
          subtitle="Open comments and suggestions"
          tone="border-sky-200 bg-sky-50 text-sky-800"
          entries={collaboration}
          state={state}
          onToggleStatus={onToggleStatus}
        />
        <Lane
          title="Resolved lane"
          subtitle="Recently resolved feedback with audit trail"
          tone="border-emerald-200 bg-emerald-50 text-emerald-800"
          entries={resolved}
          state={state}
          onToggleStatus={onToggleStatus}
        />
      </div>
    </section>
  );
}

function OptionDHybrid({
  state,
  targets,
  allEntries,
  streamEntries,
  selectedTarget,
  onSelectTarget,
  selectedTargetEntries,
  selectedEntryId,
  onSelectEntry,
  composerEntryType,
  setComposerEntryType,
  composerAuthorType,
  setComposerAuthorType,
  composerBody,
  setComposerBody,
  onCreate,
  onToggleStatus,
}: {
  state: ViewState;
  targets: FeedbackTarget[];
  allEntries: FeedbackEntry[];
  streamEntries: FeedbackEntry[];
  selectedTarget: FeedbackTarget | null;
  onSelectTarget: (targetId: string) => void;
  selectedTargetEntries: FeedbackEntry[];
  selectedEntryId: string;
  onSelectEntry: (entryId: string) => void;
  composerEntryType: EntryType;
  setComposerEntryType: (value: EntryType) => void;
  composerAuthorType: AuthorType;
  setComposerAuthorType: (value: AuthorType) => void;
  composerBody: string;
  setComposerBody: (value: string) => void;
  onCreate: () => void;
  onToggleStatus: (entryId: string) => void;
}) {
  const selectedStreamEntry = streamEntries.find((entry) => entry.id === selectedEntryId) ?? streamEntries[0] ?? null;
  const blocking = allEntries.filter((entry) => entry.status === "open" && entry.entryType === "ask_for_change");

  return (
    <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target scope</p>
        <p className="mt-1 text-[11px] text-slate-600">Quick target switching from Option A.</p>
        <ul className="mt-3 space-y-2">
          {targets.map((target) => {
            const scoped = allEntries.filter((entry) => targetKey(entry.targetType, entry.targetRef) === target.id);
            const openCount = scoped.filter((entry) => entry.status === "open").length;
            const blockingCount = scoped.filter(
              (entry) => entry.status === "open" && entry.entryType === "ask_for_change",
            ).length;
            const selected = target.id === selectedTarget?.id;

            return (
              <li key={target.id}>
                <button
                  type="button"
                  onClick={() => onSelectTarget(target.id)}
                  className={cx(
                    "w-full rounded-xl border px-3 py-2 text-left transition",
                    selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-800",
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                    {target.targetType}:{target.targetRef}
                  </p>
                  <p className="mt-1 text-xs leading-4">{target.title}</p>
                  <div className="mt-2 flex items-center gap-1 text-[10px]">
                    <span className={cx("rounded-full px-1.5 py-0.5", selected ? "bg-white/20" : "bg-white text-slate-700")}>{openCount} open</span>
                    <span className={cx("rounded-full px-1.5 py-0.5", selected ? "bg-rose-200/30" : "bg-rose-100 text-rose-700")}>{blockingCount} blocking</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quicklook composer</p>
              <p className="text-sm font-semibold text-slate-900">
                {selectedTarget ? `${selectedTarget.targetType}:${selectedTarget.targetRef}` : "Select target"}
              </p>
            </div>
            <button
              type="button"
              onClick={onCreate}
              className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              Add entry
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <OptionPills
              label="entry type"
              value={composerEntryType}
              options={entryTypeOptions}
              onChange={(next) => setComposerEntryType(next as EntryType)}
            />
            <OptionPills
              label="author type"
              value={composerAuthorType}
              options={authorTypeOptions}
              onChange={(next) => setComposerAuthorType(next as AuthorType)}
            />
          </div>

          <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Body</label>
          <textarea
            value={composerBody}
            onChange={(event) => setComposerBody(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-500"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target feed</p>
            <p className="text-xs text-slate-600">{selectedTargetEntries.length} entries</p>
          </div>

          <div className="mt-3 space-y-3">
            <FeedbackStateBanner state={state} />
            {state === "normal" && selectedTargetEntries.length === 0 ? (
              <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
                No feedback for this target yet.
              </section>
            ) : null}
            {state === "normal"
              ? selectedTargetEntries.map((entry) => (
                  <FeedbackCard key={entry.id} entry={entry} onToggleStatus={onToggleStatus} />
                ))
              : null}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Realtime stream companion</p>
            <p className="text-xs text-slate-500">{streamEntries.length} visible</p>
          </div>
          <div className="mt-3 space-y-2">
            <FeedbackStateBanner state={state} />
            {state === "normal" && streamEntries.length === 0 ? (
              <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                No stream entries available yet.
              </section>
            ) : null}
            {state === "normal"
              ? streamEntries.slice(0, 6).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectEntry(entry.id)}
                    className={cx(
                      "w-full rounded-xl border px-2.5 py-2 text-left transition",
                      selectedEntryId === entry.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-400",
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {entry.entryType} • {entry.targetType}:{entry.targetRef}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs">{entry.body}</p>
                    <p className="mt-1 text-[11px] opacity-80">{entry.authorName} | {entry.createdAgo}</p>
                  </button>
                ))
              : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected stream event</p>
          {selectedStreamEntry ? (
            <>
              <p className="mt-2 text-sm font-semibold text-slate-900">{selectedStreamEntry.targetType}:{selectedStreamEntry.targetRef}</p>
              <p className="mt-1 text-xs text-slate-600">{selectedStreamEntry.authorName} ({selectedStreamEntry.authorType})</p>
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">
                {selectedStreamEntry.body}
              </p>
              <button
                type="button"
                onClick={() => onToggleStatus(selectedStreamEntry.id)}
                className={cx(
                  "mt-3 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  selectedStreamEntry.status === "open"
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-amber-300 bg-amber-100 text-amber-800",
                )}
              >
                {selectedStreamEntry.status === "open" ? "Resolve from stream" : "Reopen from stream"}
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Pick a stream item to inspect details here.</p>
          )}
        </section>

        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">Blocking summary</p>
          <p className="mt-2 text-3xl font-semibold text-rose-900">{blocking.length}</p>
          <p className="text-sm text-rose-800">Open ask_for_change entries remain visibility-only in Project 3.</p>
        </section>
      </aside>
    </section>
  );
}

export default function DesignSetScreen() {
  const [activeOption, setActiveOption] = useState<LayoutOptionId>(layoutOptions[0].id);
  const viewState: ViewState = "normal";

  const [entries, setEntries] = useState<FeedbackEntry[]>(feedbackEntriesSeed);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(feedbackTargets[0]?.id ?? "");
  const [selectedEntryId, setSelectedEntryId] = useState<string>(feedbackEntriesSeed[0]?.id ?? "");

  const [composerEntryType, setComposerEntryType] = useState<EntryType>("comment");
  const [composerAuthorType, setComposerAuthorType] = useState<AuthorType>("human");
  const [composerBody, setComposerBody] = useState(
    "Please add explicit stale-update messaging when resolve/reopen mutation returns conflict.",
  );

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdOrder - a.createdOrder),
    [entries],
  );
  const visibleEntries = sortedEntries;

  const selectedTarget = useMemo(
    () => feedbackTargets.find((target) => target.id === selectedTargetId) ?? feedbackTargets[0] ?? null,
    [selectedTargetId],
  );

  const selectedTargetEntries = useMemo(() => {
    if (!selectedTarget) {
      return [];
    }

    return visibleEntries.filter(
      (entry) => entry.targetType === selectedTarget.targetType && entry.targetRef === selectedTarget.targetRef,
    );
  }, [visibleEntries, selectedTarget]);

  const effectiveSelectedEntryId = visibleEntries.some((entry) => entry.id === selectedEntryId)
    ? selectedEntryId
    : visibleEntries[0]?.id ?? "";

  function toggleStatus(entryId: string) {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }

        if (entry.status === "open") {
          return {
            ...entry,
            status: "resolved",
            resolvedBy: "joshua",
            resolvedAgo: "just now",
            updatedAgo: "just now",
          };
        }

        return {
          ...entry,
          status: "open",
          resolvedBy: undefined,
          resolvedAgo: undefined,
          updatedAgo: "just now",
        };
      }),
    );
  }

  function createEntry() {
    const body = composerBody.trim();
    if (!body || !selectedTarget) {
      return;
    }

    setEntries((current) => {
      const maxOrder = current.reduce((max, entry) => Math.max(max, entry.createdOrder), 0);
      const nextOrder = maxOrder + 1;

      const nextEntry: FeedbackEntry = {
        id: `fb-${String(nextOrder).padStart(3, "0")}`,
        orchestrationId: orchestrationContext.orchestrationId,
        targetType: selectedTarget.targetType,
        targetRef: selectedTarget.targetRef,
        entryType: composerEntryType,
        body,
        authorType: composerAuthorType,
        authorName: composerAuthorType === "human" ? "joshua" : "agent-reviewer",
        status: "open",
        createdAgo: "just now",
        updatedAgo: "just now",
        createdOrder: nextOrder,
      };

      return [nextEntry, ...current];
    });

    setComposerBody("");
  }

  const activeLayout = layoutOptions.find((option) => option.id === activeOption) ?? layoutOptions[0];

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-cyan-50 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-100/70 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-40 w-40 rounded-full bg-sky-100/80 blur-2xl" />

        <p className="relative text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">wireframe plus polish</p>
        <h2
          className="relative mt-1 text-3xl font-semibold text-slate-900"
          style={{ fontFamily: '"Fraunces", "Satoshi", "Avenir Next", serif' }}
        >
          Feedback Fabric v1 mockup options
        </h2>
        <p className="relative mt-2 max-w-3xl text-sm text-slate-700">
          Explore four UX strategies for Project 3 feedback capture, including a hybrid that combines target-scoped quicklook
          composition with realtime stream triage.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Layout options</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {layoutOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setActiveOption(option.id)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm transition",
                activeOption === option.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">{activeLayout.summary}</p>
      </section>

      {activeOption === "option-a" ? (
        <OptionAQuicklook
          state={viewState}
          targets={feedbackTargets}
          allEntries={sortedEntries}
          selectedTarget={selectedTarget}
          onSelectTarget={setSelectedTargetId}
          selectedTargetEntries={selectedTargetEntries}
          composerEntryType={composerEntryType}
          setComposerEntryType={setComposerEntryType}
          composerAuthorType={composerAuthorType}
          setComposerAuthorType={setComposerAuthorType}
          composerBody={composerBody}
          setComposerBody={setComposerBody}
          onCreate={createEntry}
          onToggleStatus={toggleStatus}
        />
      ) : null}

      {activeOption === "option-b" ? (
        <OptionBStream
          state={viewState}
          entries={visibleEntries}
          selectedEntryId={effectiveSelectedEntryId}
          onSelectEntry={setSelectedEntryId}
          onToggleStatus={toggleStatus}
        />
      ) : null}

      {activeOption === "option-c" ? (
        <OptionCTriage state={viewState} entries={visibleEntries} onToggleStatus={toggleStatus} />
      ) : null}

      {activeOption === "option-d" ? (
        <OptionDHybrid
          state={viewState}
          targets={feedbackTargets}
          allEntries={sortedEntries}
          streamEntries={visibleEntries}
          selectedTarget={selectedTarget}
          onSelectTarget={setSelectedTargetId}
          selectedTargetEntries={selectedTargetEntries}
          selectedEntryId={effectiveSelectedEntryId}
          onSelectEntry={setSelectedEntryId}
          composerEntryType={composerEntryType}
          setComposerEntryType={setComposerEntryType}
          composerAuthorType={composerAuthorType}
          setComposerAuthorType={setComposerAuthorType}
          composerBody={composerBody}
          setComposerBody={setComposerBody}
          onCreate={createEntry}
          onToggleStatus={toggleStatus}
        />
      ) : null}
    </div>
  );
}
