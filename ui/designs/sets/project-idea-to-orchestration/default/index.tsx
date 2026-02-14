import { useMemo, useState } from "react";
import {
  alerts,
  boardColumns,
  boardItems,
  brainstormClusters,
  launchChecklist,
  launchPresets,
  metrics,
  planSections,
  stageSteps,
  type BoardItem,
  type ItemType,
  type LaunchPreset,
  type PlanSection,
  type StageId,
} from "./data";

type LayoutOptionId = "pipeline-first" | "plan-first" | "launch-first";
type DataState = "normal" | "loading" | "empty" | "error";
type TypeFilter = "all" | ItemType;
type OptionBPageId = "project-tasks-designs" | "new-orchestration";

const dataStateOptions: DataState[] = ["normal", "loading", "empty", "error"];
const typeFilters: TypeFilter[] = ["all", "idea", "bug", "story", "design"];

const typeTone: Record<ItemType, string> = {
  idea: "bg-slate-100 text-slate-700",
  bug: "bg-slate-900 text-white",
  story: "bg-slate-200 text-slate-800",
  design: "bg-zinc-200 text-zinc-800",
};

const priorityTone: Record<BoardItem["priority"], string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-slate-200 text-slate-700",
  high: "bg-slate-300 text-slate-800",
  critical: "bg-slate-900 text-white",
};

const alertTone: Record<(typeof alerts)[number]["severity"], string> = {
  info: "border-slate-300 bg-slate-50 text-slate-700",
  warning: "border-slate-400 bg-slate-100 text-slate-800",
  risk: "border-slate-900 bg-slate-200 text-slate-900",
};

function titleCase(value: string): string {
  return value.replace(/(^|-)(\w)/g, (_, start: string, letter: string) => `${start}${letter.toUpperCase()}`);
}

function statusTone(status: PlanSection["status"]): string {
  if (status === "approved") {
    return "bg-slate-900 text-white";
  }
  if (status === "review") {
    return "bg-slate-300 text-slate-800";
  }
  return "bg-slate-100 text-slate-700";
}

function checklistTone(state: (typeof launchChecklist)[number]["state"]): string {
  if (state === "done") {
    return "bg-slate-200 text-slate-800";
  }
  if (state === "blocked") {
    return "bg-slate-900 text-white";
  }
  return "bg-slate-100 text-slate-700";
}

function StageRail({
  activeStage,
  onSelectStage,
}: {
  activeStage: StageId;
  onSelectStage: (stage: StageId) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Major pages</p>
      <ol className="mt-2 space-y-2">
        {stageSteps.map((step, index) => {
          const selected = step.id === activeStage;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelectStage(step.id)}
                className={[
                  "w-full rounded-lg border px-2 py-2 text-left",
                  selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-800",
                ].join(" ")}
              >
                <p className={selected ? "text-xs font-semibold text-white" : "text-xs font-semibold text-slate-800"}>
                  {index + 1}. {step.label}
                </p>
                <p className={selected ? "mt-1 text-[11px] text-slate-100" : "mt-1 text-[11px] text-slate-600"}>
                  {step.goal}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OptionBPageTabs({
  activePage,
  onSelectPage,
}: {
  activePage: OptionBPageId;
  onSelectPage: (page: OptionBPageId) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Major pages</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onSelectPage("project-tasks-designs")}
          className={[
            "rounded border px-2 py-1 text-xs",
            activePage === "project-tasks-designs"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-slate-50 text-slate-700",
          ].join(" ")}
        >
          Project tasks/designs
        </button>
        <button
          type="button"
          onClick={() => onSelectPage("new-orchestration")}
          className={[
            "rounded border px-2 py-1 text-xs",
            activePage === "new-orchestration"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-slate-50 text-slate-700",
          ].join(" ")}
        >
          New orchestration
        </button>
      </div>
    </section>
  );
}

function MetricsStrip({ state }: { state: DataState }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.label} className="rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
          {state === "loading" ? <div className="mt-2 h-7 w-16 rounded bg-slate-200" /> : null}
          {state === "error" ? <p className="mt-2 text-sm text-slate-500">Metric unavailable</p> : null}
          {state !== "loading" && state !== "error" ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{state === "empty" ? "-" : metric.value}</p>
              <p className="mt-1 text-xs text-slate-600">{state === "empty" ? "No signal yet" : metric.detail}</p>
            </>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function AlertStrip({ state }: { state: DataState }) {
  if (state === "loading") {
    return (
      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Alerts</p>
        <div className="mt-2 space-y-2">
          <div className="h-8 rounded bg-slate-200" />
          <div className="h-8 rounded bg-slate-200" />
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Alerts</p>
        <p className="mt-2 rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Could not load alert feed. Keep launch in safe mode.
        </p>
      </section>
    );
  }

  if (state === "empty") {
    return (
      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Alerts</p>
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          No active alerts.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Alerts and risks</p>
      <ul className="mt-2 space-y-2">
        {alerts.map((alert) => (
          <li key={alert.id} className={["rounded border px-2 py-2", alertTone[alert.severity]].join(" ")}>
            <p className="text-xs font-medium">{alert.message}</p>
            <button type="button" className="mt-1 rounded border border-slate-400 bg-white px-2 py-0.5 text-[11px]">
              {alert.action}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}


function KanbanBoard({
  items,
  state,
  selectedItemId,
  onSelectItem,
}: {
  items: BoardItem[];
  state: DataState;
  selectedItemId: string;
  onSelectItem: (itemId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Mixed-type kanban</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          idea / bug / story / design
        </span>
      </div>

      {state === "error" ? (
        <p className="rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Board data failed to load.
        </p>
      ) : (
        <div className="grid gap-2 xl:grid-cols-4">
          {boardColumns.map((column) => {
            const columnItems = items.filter((item) => item.column === column.id);

            return (
              <article key={column.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{column.label}</p>
                    <p className="text-[11px] text-slate-600">{column.hint}</p>
                  </div>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                    WIP {columnItems.length}/{column.wipLimit}
                  </span>
                </div>

                {state === "loading" ? (
                  <div className="space-y-2">
                    <div className="h-16 rounded border border-slate-200 bg-white" />
                    <div className="h-16 rounded border border-slate-200 bg-white" />
                  </div>
                ) : null}

                {state === "empty" ? (
                  <p className="rounded border border-dashed border-slate-300 bg-white px-2 py-3 text-[11px] text-slate-600">
                    No cards in this lane.
                  </p>
                ) : null}

                {state === "normal" ? (
                  <ul className="space-y-2">
                    {columnItems.map((item) => {
                      const selected = item.id === selectedItemId;

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => onSelectItem(item.id)}
                            className={[
                              "w-full rounded border px-2 py-2 text-left",
                              selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white",
                            ].join(" ")}
                          >
                            <div className="flex flex-wrap items-center gap-1">
                              <span
                                className={[
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  selected ? "bg-white/20 text-white" : typeTone[item.type],
                                ].join(" ")}
                              >
                                {item.type}
                              </span>
                              <span
                                className={[
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  selected ? "bg-white/20 text-white" : priorityTone[item.priority],
                                ].join(" ")}
                              >
                                {item.priority}
                              </span>
                            </div>
                            <p className={selected ? "mt-1 text-xs text-white" : "mt-1 text-xs text-slate-800"}>
                              {item.id} - {item.title}
                            </p>
                            <p className={selected ? "mt-1 text-[11px] text-slate-100" : "mt-1 text-[11px] text-slate-600"}>
                              owner: {item.owner} | est: {item.estimate} | notes: {item.notes}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemInspector({ item, state }: { item: BoardItem | null; state: DataState }) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">Item inspector</p>

      {state === "loading" ? <div className="mt-2 h-20 rounded bg-slate-200" /> : null}
      {state === "error" ? (
        <p className="mt-2 rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Item detail unavailable.
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          Select a card once work items exist.
        </p>
      ) : null}

      {state === "normal" && item ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-semibold text-slate-800">
            {item.id} | {item.title}
          </p>
          <div className="flex flex-wrap gap-1">
            <span className={["rounded px-1.5 py-0.5 text-[10px] font-medium", typeTone[item.type]].join(" ")}>
              {titleCase(item.type)}
            </span>
            <span
              className={["rounded px-1.5 py-0.5 text-[10px] font-medium", priorityTone[item.priority]].join(" ")}
            >
              {titleCase(item.priority)}
            </span>
          </div>
          <p className="text-xs text-slate-600">Owner: {item.owner}</p>
          <p className="text-xs text-slate-600">Estimate: {item.estimate}</p>
          {item.blockedReason ? (
            <p className="rounded border border-slate-400 bg-slate-100 px-2 py-1 text-xs text-slate-700">
              Blocked: {item.blockedReason}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-2">
            <button type="button" className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white">
              Edit card
            </button>
            <button type="button" className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">
              Promote to design plan
            </button>
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
              Move to next column
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QuickIdeaWorkspace({ intakeItems, state }: { intakeItems: BoardItem[]; state: DataState }) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Quick idea page</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">fast capture</span>
      </div>

      {state === "loading" ? <div className="h-24 rounded border border-slate-200 bg-slate-100" /> : null}
      {state === "error" ? (
        <p className="rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Idea intake stream is temporarily unavailable.
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          No ideas captured yet. Use the quick-capture action to seed the board.
        </p>
      ) : null}

      {state === "normal" ? (
        <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-800">Capture panel</p>
            <div className="mt-2 space-y-1">
              <button type="button" className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs">
                + New idea
              </button>
              <button type="button" className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs">
                + New bug
              </button>
              <button type="button" className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs">
                + New story
              </button>
              <button type="button" className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs">
                + New design task
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-800">Recent intake</p>
            <ul className="mt-2 space-y-1">
              {intakeItems.slice(0, 4).map((item) => (
                <li key={item.id} className="rounded border border-slate-200 bg-white px-2 py-1">
                  <p className="text-xs text-slate-800">{item.id} - {item.title}</p>
                  <p className="text-[11px] text-slate-600">{item.type} | owner {item.owner}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BrainstormWorkspace({ state }: { state: DataState }) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Brainstorm page</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">cluster and challenge</span>
      </div>

      {state === "loading" ? <div className="h-28 rounded border border-slate-200 bg-slate-100" /> : null}
      {state === "error" ? (
        <p className="rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Brainstorm clusters unavailable.
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          No clusters created yet.
        </p>
      ) : null}

      {state === "normal" ? (
        <ul className="grid gap-2 md:grid-cols-3">
          {brainstormClusters.map((cluster) => (
            <li key={cluster.id} className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-800">{cluster.title}</p>
              <p className="mt-1 text-[11px] text-slate-600">{cluster.hypothesis}</p>
              <p className="mt-1 text-[11px] text-slate-600">linked cards: {cluster.linkedItemIds.join(", ")}</p>
              <p className="mt-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600">
                open: {cluster.openQuestions[0]}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function DesignPlanWorkspace({
  state,
  selectedSectionId,
  onSelectSection,
}: {
  state: DataState;
  selectedSectionId: string;
  onSelectSection: (sectionId: string) => void;
}) {
  const selected = planSections.find((section) => section.id === selectedSectionId) ?? planSections[0];

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Design plan page</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">reviewable sections</span>
      </div>

      {state === "loading" ? <div className="h-28 rounded border border-slate-200 bg-slate-100" /> : null}
      {state === "error" ? (
        <p className="rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Design plan failed to load.
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          No plan sections yet.
        </p>
      ) : null}

      {state === "normal" ? (
        <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
          <ul className="space-y-1">
            {planSections.map((section) => {
              const selectedRow = section.id === selected.id;

              return (
                <li key={section.id}>
                  <button

                    type="button"
                    onClick={() => onSelectSection(section.id)}
                    className={[
                      "w-full rounded border px-2 py-2 text-left",
                      selectedRow ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={selectedRow ? "text-xs font-semibold text-white" : "text-xs font-semibold text-slate-800"}>
                        {section.title}
                      </p>
                      <span
                        className={[
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          selectedRow ? "bg-white/20 text-white" : statusTone(section.status),
                        ].join(" ")}
                      >
                        {section.status}
                      </span>
                    </div>
                    <p className={selectedRow ? "mt-1 text-[11px] text-slate-100" : "mt-1 text-[11px] text-slate-600"}>
                      owner {section.owner} | open decisions {section.decisionsOpen}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-800">Section detail</p>
            <p className="mt-1 text-xs text-slate-700">{selected.title}</p>
            <p className="mt-1 text-[11px] text-slate-600">Last edit: {selected.updatedAgo}</p>
            <p className="mt-1 text-[11px] text-slate-600">Linked cards: {selected.linkedItemIds.join(", ")}</p>
            <button type="button" className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
              Open section comments
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LaunchReadinessPanel({
  state,
  selectedPreset,
  selectedSection,
  compact,
  presets,
  selectedPresetId,
  onSelectPreset,
}: {
  state: DataState;
  selectedPreset: LaunchPreset;
  selectedSection: PlanSection | null;
  compact?: boolean;
  presets?: LaunchPreset[];
  selectedPresetId?: string;
  onSelectPreset?: (presetId: string) => void;
}) {
  const hasBlocked = launchChecklist.some((item) => item.state === "blocked");

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Orchestration launch</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {hasBlocked ? "blocked gate" : "ready gate"}
        </span>
      </div>

      {state === "loading" ? <div className="h-20 rounded border border-slate-200 bg-slate-100" /> : null}
      {state === "error" ? (
        <p className="rounded border border-slate-400 bg-slate-100 px-2 py-2 text-xs text-slate-700">
          Launch configuration unavailable.
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          Select an approved plan section before launch.
        </p>
      ) : null}

      {state === "normal" ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-700">
            Launch from section: {selectedSection ? selectedSection.title : "No section selected"}
          </p>
          {presets && selectedPresetId && onSelectPreset ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Preset</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {presets.map((preset) => {
                  const selected = preset.id === selectedPresetId;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectPreset(preset.id)}
                      className={[
                        "rounded border px-1.5 py-0.5 text-[11px]",
                        selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700",
                      ].join(" ")}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-800">{selectedPreset.name}</p>
            {!compact ? <p className="mt-1 text-[11px] text-slate-600">{selectedPreset.description}</p> : null}
            <p className="mt-1 text-[11px] text-slate-600">
              task {selectedPreset.taskModel} | review {selectedPreset.reviewModel}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              parallelism {selectedPreset.parallelism} | human review{" "}
              {selectedPreset.requiresHumanReview ? "required" : "optional"} | risk {selectedPreset.riskMode}
            </p>
          </div>

          {!compact ? (
            <ul className="space-y-1">
              {launchChecklist.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1">
                  <p className="text-[11px] text-slate-700">{item.label}</p>
                  <span className={["rounded px-1.5 py-0.5 text-[10px] font-medium", checklistTone(item.state)].join(" ")}>
                    {item.state}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-2">
            <button
              type="button"
              className={[
                "rounded border px-2 py-1 text-xs font-medium",
                hasBlocked ? "border-slate-300 bg-slate-100 text-slate-500" : "border-slate-900 bg-slate-900 text-white",
              ].join(" ")}
            >
              Start orchestration
            </button>
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
              Save preset override
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StageWorkspace({
  stage,
  intakeItems,
  state,
  selectedSectionId,
  onSelectSection,
  selectedPreset,
  selectedSection,
}: {
  stage: StageId;
  intakeItems: BoardItem[];
  state: DataState;
  selectedSectionId: string;
  onSelectSection: (sectionId: string) => void;
  selectedPreset: LaunchPreset;
  selectedSection: PlanSection | null;
}) {
  if (stage === "quick-idea") {
    return <QuickIdeaWorkspace intakeItems={intakeItems} state={state} />;
  }
  if (stage === "brainstorm") {
    return <BrainstormWorkspace state={state} />;
  }
  if (stage === "design-plan") {
    return <DesignPlanWorkspace state={state} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} />;
  }
  return <LaunchReadinessPanel state={state} selectedPreset={selectedPreset} selectedSection={selectedSection} />;
}

export default function ProjectIdeaToOrchestrationSet() {
  const [activeLayoutId] = useState<LayoutOptionId>("plan-first");
  const [activeStage, setActiveStage] = useState<StageId>("quick-idea");
  const [dataState, setDataState] = useState<DataState>("normal");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [optionBPage, setOptionBPage] = useState<OptionBPageId>("project-tasks-designs");
  const [selectedItemId, setSelectedItemId] = useState<string>(boardItems[0]?.id ?? "");
  const [selectedDesignId, setSelectedDesignId] = useState<string>(
    boardItems.find((item) => item.type === "design")?.id ?? "",
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string>(planSections[0]?.id ?? "");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(launchPresets[0]?.id ?? "");

  const isOptionBSimplified = activeLayoutId === "plan-first";
  const effectiveTypeFilter = isOptionBSimplified ? "all" : typeFilter;
  const effectiveDataState: DataState = isOptionBSimplified ? "normal" : dataState;

  const filteredItems = useMemo(
    () => (effectiveTypeFilter === "all" ? boardItems : boardItems.filter((item) => item.type === effectiveTypeFilter)),
    [effectiveTypeFilter],
  );

  const visibleItems = effectiveDataState === "normal" ? filteredItems : [];
  const intakeItems = visibleItems.filter((item) => item.column === "intake");
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? null;
  const designItems = visibleItems.filter((item) => item.type === "design");
  const selectedDesign =
    designItems.find((item) => item.id === selectedDesignId) ??
    designItems[0] ??
    null;
  const selectedSection = planSections.find((section) => section.id === selectedSectionId) ?? null;
  const selectedPreset = launchPresets.find((preset) => preset.id === selectedPresetId) ?? launchPresets[0];

  const launchDesignAsOrchestration = (designId: string) => {
    setSelectedDesignId(designId);
    setOptionBPage("new-orchestration");

    const linkedSection = planSections.find((section) => section.linkedItemIds.includes(designId));
    if (linkedSection) {
      setSelectedSectionId(linkedSection.id);
    }
  };

  const optionBody =
    activeLayoutId === "pipeline-first" ? (
      <section className="grid gap-3 xl:grid-cols-[230px_1fr_320px]">
        <StageRail activeStage={activeStage} onSelectStage={setActiveStage} />
        <div className="space-y-3">
          <StageWorkspace
            stage={activeStage}
            intakeItems={intakeItems}
            state={effectiveDataState}
            selectedSectionId={selectedSectionId}
            onSelectSection={setSelectedSectionId}
            selectedPreset={selectedPreset}
            selectedSection={selectedSection}
          />
          <KanbanBoard
            items={visibleItems}
            state={effectiveDataState}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
          />
        </div>
        <div className="space-y-3">
          <ItemInspector item={selectedItem} state={effectiveDataState} />
          <LaunchReadinessPanel
            state={effectiveDataState}
            selectedPreset={selectedPreset}
            selectedSection={selectedSection}
            compact
          />
        </div>
      </section>
    ) : activeLayoutId === "plan-first" ? (
      <section className="space-y-3">
        <OptionBPageTabs activePage={optionBPage} onSelectPage={setOptionBPage} />

        {optionBPage === "project-tasks-designs" ? (
          <section className="grid gap-3 xl:grid-cols-[1.25fr_1fr]">
            <div className="space-y-3">
              <KanbanBoard
                items={visibleItems}
                state={effectiveDataState}
                selectedItemId={selectedItemId}
                onSelectItem={setSelectedItemId}
              />

              <section className="rounded-xl border border-slate-300 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Design cards</p>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    Launchable as orchestration
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {designItems.map((item) => (
                    <li key={item.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
                      <p className="text-xs font-medium text-slate-800">{item.id} - {item.title}</p>
                      <p className="mt-1 text-[11px] text-slate-600">owner {item.owner} | priority {item.priority}</p>
                      <button
                        type="button"
                        onClick={() => launchDesignAsOrchestration(item.id)}
                        className="mt-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                      >
                        Launch as orchestration
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="space-y-3">
              <DesignPlanWorkspace
                state={effectiveDataState}
                selectedSectionId={selectedSectionId}
                onSelectSection={setSelectedSectionId}
              />
              <ItemInspector item={selectedItem} state={effectiveDataState} />
            </div>
          </section>
        ) : (
          <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <section className="rounded-xl border border-slate-300 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">New orchestration</p>
                <p className="mt-1 text-xs text-slate-600">
                  Choose a design card as the source, then start orchestration.
                </p>

                <ul className="mt-2 space-y-1">
                  {designItems.map((item) => {
                    const selected = item.id === (selectedDesign?.id ?? "");
                    const linkedSection = planSections.find((section) => section.linkedItemIds.includes(item.id));

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDesignId(item.id);
                            if (linkedSection) {
                              setSelectedSectionId(linkedSection.id);
                            }
                          }}
                          className={[
                            "w-full rounded border px-2 py-2 text-left",
                            selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-800",
                          ].join(" ")}
                        >
                          <p className={selected ? "text-xs font-semibold text-white" : "text-xs font-semibold text-slate-800"}>
                            {item.id} - {item.title}
                          </p>
                          <p className={selected ? "mt-1 text-[11px] text-slate-100" : "mt-1 text-[11px] text-slate-600"}>
                            {linkedSection ? `Maps to: ${linkedSection.title}` : "No linked plan section"}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-xl border border-slate-300 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">Selected context</p>
                <p className="mt-1 text-xs text-slate-700">
                  Design: {selectedDesign ? `${selectedDesign.id} - ${selectedDesign.title}` : "No design selected"}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Plan section: {selectedSection ? selectedSection.title : "No linked section"}
                </p>
              </section>
            </div>

            <LaunchReadinessPanel
              state={effectiveDataState}
              selectedPreset={selectedPreset}
              selectedSection={selectedSection}
              compact
              presets={launchPresets}
              selectedPresetId={selectedPreset.id}
              onSelectPreset={setSelectedPresetId}
            />
          </section>
        )}
      </section>
    ) : (
      <section className="space-y-3">
        <section className="rounded-xl border border-slate-300 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Launch cockpit</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Design plan to orchestration handoff is the primary decision surface.
              </p>
            </div>
            <button type="button" className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white">
              Start from selected plan
            </button>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <StageRail activeStage={activeStage} onSelectStage={setActiveStage} />
            <StageWorkspace
              stage={activeStage}
              intakeItems={intakeItems}
              state={effectiveDataState}
              selectedSectionId={selectedSectionId}
              onSelectSection={setSelectedSectionId}
              selectedPreset={selectedPreset}
              selectedSection={selectedSection}
            />
          </div>

          <div className="space-y-3">
            <LaunchReadinessPanel
              state={effectiveDataState}
              selectedPreset={selectedPreset}
              selectedSection={selectedSection}
            />
            <KanbanBoard
              items={visibleItems}
              state={effectiveDataState}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
            />
            <ItemInspector item={selectedItem} state={effectiveDataState} />
          </div>
        </div>
      </section>
    );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">option b wireframe</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          Two separate pages: project tasks/designs and new orchestration
        </h2>
        <p className="mt-1 text-sm text-slate-700">
          Designs are managed on the project page and launched from the dedicated orchestration page.
        </p>
      </section>

      {!isOptionBSimplified ? (
        <>
          <section className="grid gap-2 rounded-xl border border-slate-300 bg-white p-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Type filter</span>
              {typeFilters.map((filter) => {
                const active = filter === typeFilter;

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTypeFilter(filter)}
                    className={[
                      "rounded border px-2 py-1 text-xs",
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-slate-50 text-slate-700",
                    ].join(" ")}
                  >
                    {titleCase(filter)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data state</span>
              <div className="flex gap-1">
                {dataStateOptions.map((option) => {
                  const active = option === dataState;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDataState(option)}
                      className={[
                        "rounded border px-2 py-1 text-xs",
                        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-slate-50 text-slate-700",
                      ].join(" ")}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-slate-600">
                showing {visibleItems.length} cards {typeFilter === "all" ? "across all types" : `for ${typeFilter}`}
              </span>
            </div>
          </section>

          <MetricsStrip state={dataState} />
          <AlertStrip state={dataState} />
        </>
      ) : null}
      {optionBody}
    </div>
  );
}
