import { useMemo, useState } from "react";
import {
  getDesignPlan,
  getPhasePlan,
  historyRuns,
  orchestrations,
  projectNav,
  type OrchestrationDetail,
  type OrchestrationPhase,
  type OrchestrationStatus,
  type PhaseTask,
  type PlanDocument,
  type ReviewActor,
  type TaskStatus,
} from "./data";

type Screen = "workspace" | "project-history" | "review" | "terminal";
type ReviewTarget = "code" | "design_plan" | "phase_plan";
type PlanView = "preview" | "comments";
type CommentState = "open" | "resolved";
type ConfigModel = "haiku-4.1" | "sonnet-4.5" | "opus-4.1";
type ReviewPolicy = "agent_only" | "hitl_optional" | "hitl_required";

type ReviewThread = {
  id: string;
  orchestrationId: string;
  phaseNumber?: number;
  target: ReviewTarget;
  section: string;
  line: number;
  author: ReviewActor;
  comment: string;
  state: CommentState;
  createdAgo: string;
};

type ReviewArtifact = {
  id: string;
  orchestrationId: string;
  phaseNumber?: number;
  target: ReviewTarget;
  actor: ReviewActor;
  outcome: "approved" | "changes_requested" | "commented";
  summary: string;
  createdAgo: string;
};

type OrchestrationConfig = {
  taskModel: ConfigModel;
  reviewModel: ConfigModel;
  planModel: ConfigModel;
  reviewPolicy: ReviewPolicy;
  parallelism: number;
  livePatchPending: boolean;
};

const orchestrationStatusTone: Record<OrchestrationStatus, string> = {
  planning: "bg-slate-200 text-slate-700",
  executing: "bg-emerald-100 text-emerald-800",
  reviewing: "bg-amber-100 text-amber-800",
  blocked: "bg-rose-100 text-rose-800",
  complete: "bg-sky-100 text-sky-800",
};

const taskStatusTone: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-emerald-100 text-emerald-800",
  blocked: "bg-rose-100 text-rose-800",
  done: "bg-sky-100 text-sky-800",
};
type MemberStatus = TaskStatus | "idle";

const memberStatusTone: Record<MemberStatus, string> = {
  ...taskStatusTone,
  idle: "bg-slate-100 text-slate-600",
};

const reviewThreads: ReviewThread[] = [
  {
    id: "thread-1",
    orchestrationId: "orch-1001",
    phaseNumber: 3,
    target: "phase_plan",
    section: "Phase plan",
    line: 4,
    author: "agent",
    comment: "Please add explicit pass/fail thresholds for reproducibility checks.",
    state: "open",
    createdAgo: "3m ago",
  },
  {
    id: "thread-2",
    orchestrationId: "orch-1001",
    phaseNumber: 3,
    target: "code",
    section: "tina-harness/src/main.rs",
    line: 48,
    author: "human",
    comment: "Need confidence this result snapshot path is stable across OS paths.",
    state: "open",
    createdAgo: "8m ago",
  },
  {
    id: "thread-3",
    orchestrationId: "orch-1009",
    phaseNumber: 3,
    target: "design_plan",
    section: "Design plan",
    line: 14,
    author: "human",
    comment: "Clarify who owns arbitration when both human and agent reviews conflict.",
    state: "resolved",
    createdAgo: "20m ago",
  },
];

const reviewArtifacts: ReviewArtifact[] = [
  {
    id: "artifact-1",
    orchestrationId: "orch-1001",
    phaseNumber: 3,
    target: "code",
    actor: "agent",
    outcome: "commented",
    summary: "Code reviewer requested deterministic path handling changes.",
    createdAgo: "7m ago",
  },
  {
    id: "artifact-2",
    orchestrationId: "orch-1001",
    phaseNumber: 3,
    target: "phase_plan",
    actor: "human",
    outcome: "changes_requested",
    summary: "Human asked for explicit reproducibility acceptance criteria.",
    createdAgo: "4m ago",
  },
  {
    id: "artifact-3",
    orchestrationId: "orch-998",
    phaseNumber: 2,
    target: "design_plan",
    actor: "human",
    outcome: "commented",
    summary: "Security review requested tighter key handling requirements.",
    createdAgo: "16m ago",
  },
];

const initialConfigByOrchestrationId: Record<string, OrchestrationConfig> = {
  "orch-1009": {
    taskModel: "sonnet-4.5",
    reviewModel: "opus-4.1",
    planModel: "sonnet-4.5",
    reviewPolicy: "hitl_optional",
    parallelism: 3,
    livePatchPending: false,
  },
  "orch-998": {
    taskModel: "sonnet-4.5",
    reviewModel: "opus-4.1",
    planModel: "sonnet-4.5",
    reviewPolicy: "hitl_required",
    parallelism: 2,
    livePatchPending: false,
  },
  "orch-1001": {
    taskModel: "haiku-4.1",
    reviewModel: "sonnet-4.5",
    planModel: "sonnet-4.5",
    reviewPolicy: "hitl_required",
    parallelism: 2,
    livePatchPending: false,
  },
};

const modelOptions: ConfigModel[] = ["haiku-4.1", "sonnet-4.5", "opus-4.1"];

function contextKey(orchestrationId: string, phaseNumber: number): string {
  return `${orchestrationId}:${phaseNumber}`;
}

function labelFromSnake(value: string): string {
  return value.replace(/_/g, " ");
}

function memberStatusFromTasks(tasks: PhaseTask[]): MemberStatus {
  if (tasks.some((task) => task.status === "blocked")) {
    return "blocked";
  }

  if (tasks.some((task) => task.status === "in_progress")) {
    return "in_progress";
  }

  if (tasks.some((task) => task.status === "todo")) {
    return "todo";
  }

  if (tasks.some((task) => task.status === "done")) {
    return "done";
  }

  return "idle";
}

function summarizeTeam(members: string[], tasks: PhaseTask[]) {
  const roster = Array.from(new Set([...members, ...tasks.map((task) => task.owner)])).sort((a, b) => a.localeCompare(b));

  return roster.map((member) => {
    const memberTasks = tasks.filter((task) => task.owner === member);
    const status = memberStatusFromTasks(memberTasks);
    const taskSummary = memberTasks.map((task) => `${task.id} (${labelFromSnake(task.status)})`);

    return {
      member,
      status,
      taskSummary,
      taskCount: memberTasks.length,
    };
  });
}

function diffLinesForPhase(phase: OrchestrationPhase): string[] {
  const firstFile = phase.git.files[0] ?? "src/file.ts";

  return [
    `diff --git a/${firstFile} b/${firstFile}`,
    "@@ -10,6 +10,16 @@",
    " export async function runReviewPhase() {",
    "+  // Added review artifact emission so human + agent reviews share one record shape",
    "+  const artifact = {",
    "+    actor: reviewerType,",
    "+    outcome: reviewOutcome,",
    "+    target: reviewTarget,",
    "+    sourceLine: selectedLine,",
    "+  };",
    "+  await persistReviewArtifact(artifact);",
    " }",
  ];
}

function projectRepoPath(projectName: string): string {
  return projectNav.find((project) => project.project === projectName)?.repoPath ?? "-";
}

function Sidebar({
  selectedOrchestrationId,
  onSelectOrchestration,
  onViewAll,
}: {
  selectedOrchestrationId: string;
  onSelectOrchestration: (orchestrationId: string) => void;
  onViewAll: (project: string) => void;
}) {
  return (
    <aside className="flex h-full flex-col rounded-xl border border-slate-300 bg-white p-3">
      <div className="border-b border-slate-200 pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Projects</p>
        <button
          type="button"
          className="mt-2 w-full rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-xs text-slate-700"
        >
          Open command palette (cmd+k)
        </button>
      </div>

      <div className="mt-3 space-y-3 overflow-y-auto pr-1">
        {projectNav.map((project) => {
          const runs = orchestrations.filter((orchestration) => orchestration.project === project.project);

          return (
            <article key={project.project} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{project.project}</p>
                  <p className="text-xs text-slate-500">{project.repoPath}</p>
                </div>
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {runs.length} active
                </span>
              </div>

              <ul className="space-y-1">
                {runs.map((run) => {
                  const selected = run.id === selectedOrchestrationId;

                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => onSelectOrchestration(run.id)}
                        className={[
                          "w-full rounded border px-2 py-1.5 text-left",
                          selected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-800",
                        ].join(" ")}
                      >
                        <p className={selected ? "text-xs font-semibold text-white" : "text-xs font-semibold text-slate-800"}>
                          {run.feature}
                        </p>
                        <p className={selected ? "mt-1 text-[11px] text-slate-100" : "mt-1 text-[11px] text-slate-600"}>
                          P{run.currentPhase}/{run.totalPhases}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={() => onViewAll(project.project)}
                className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              >
                View all ({project.totalHistory})
              </button>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function CompactContextWidget({
  baseline,
  orchestration,
  phase,
  onFocusBaseline,
  onOpenReview,
  onOpenTerminal,
  onOpenSettings,
}: {
  baseline: OrchestrationDetail;
  orchestration: OrchestrationDetail;
  phase: OrchestrationPhase;
  onFocusBaseline: () => void;
  onOpenReview: (target: ReviewTarget) => void;
  onOpenTerminal: () => void;
  onOpenSettings: () => void;
}) {
  const baselineFocused = baseline.id === orchestration.id;
  const orchestrationTeam = Array.from(new Set(orchestration.phases.flatMap((orchestrationPhase) => orchestrationPhase.team)));
  const orchestrationTasks = orchestration.phases.flatMap((orchestrationPhase) => orchestrationPhase.tasks);
  const orchestrationTeamSummary = summarizeTeam(orchestrationTeam, orchestrationTasks);
  const phaseTeamSummary = summarizeTeam(phase.team, phase.tasks);

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Baseline + context</p>
        <button
          type="button"
          onClick={onFocusBaseline}
          className={[
            "rounded border px-1.5 py-0.5 text-[11px]",
            baselineFocused ? "border-slate-300 bg-white text-slate-600" : "border-slate-900 bg-slate-900 text-white",
          ].join(" ")}
        >
          {baselineFocused ? "Baseline focused" : "Focus baseline"}
        </button>
      </div>

      <p className="mt-1 text-[11px] text-slate-600">
        baseline: {baseline.status} | P{baseline.currentPhase}/{baseline.totalPhases}
      </p>

      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Current orchestration</p>
          <p className="truncate text-xs font-semibold text-slate-900">{orchestration.feature}</p>
        </div>

        <p className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700">
          status {orchestration.status} | phase {orchestration.currentPhase}/{orchestration.totalPhases} | elapsed {orchestration.elapsed} | event {orchestration.lastEventAge}
        </p>

        <div className="mt-1 grid gap-1">
          <div className="rounded border border-slate-200 bg-white px-1.5 py-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Orchestration team</p>
            <ul className="mt-1 space-y-1">
              {orchestrationTeamSummary.map((summary) => (
                <li key={summary.member} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-800">{summary.member}</p>
                    <span
                      className={[
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        memberStatusTone[summary.status],
                      ].join(" ")}
                    >
                      {labelFromSnake(summary.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-600">
                    {summary.taskCount > 0 ? summary.taskSummary.join(", ") : "No associated tasks"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded border border-slate-200 bg-white px-1.5 py-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Current phase team</p>
            <ul className="mt-1 space-y-1">
              {phaseTeamSummary.map((summary) => (
                <li key={summary.member} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-800">{summary.member}</p>
                    <span
                      className={[
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        memberStatusTone[summary.status],
                      ].join(" ")}
                    >
                      {labelFromSnake(summary.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-600">
                    {summary.taskCount > 0 ? summary.taskSummary.join(", ") : "No associated tasks"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-1 truncate text-[11px] text-slate-700">
        {orchestration.project} | P{phase.phaseNumber} {phase.title} | {orchestration.branch} | {projectRepoPath(orchestration.project)}
      </p>

      <div className="mt-1 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onOpenReview("design_plan")}
          className="rounded border border-slate-300 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-700"
        >
          Design plan
        </button>
        <button
          type="button"
          onClick={() => onOpenReview("phase_plan")}
          className="rounded border border-slate-300 bg-slate-50 px-1.5 py-1 text-[11px] text-slate-700"
        >
          Phase plan
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={onOpenTerminal}
          className="rounded border border-slate-900 bg-slate-900 px-1.5 py-1 text-[11px] font-medium text-white"
        >
          Terminal
        </button>
      </div>
    </section>
  );
}

function OrchestrationConfigModal({
  orchestration,
  config,
  onChange,
  onClose,
}: {
  orchestration: OrchestrationDetail;
  config: OrchestrationConfig;
  onChange: (next: OrchestrationConfig) => void;
  onClose: () => void;
}) {
  const isRunning = ["executing", "reviewing", "blocked"].includes(orchestration.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Orchestration settings</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{orchestration.feature}</h3>
            <p className="mt-1 text-xs text-slate-600">
              Status: {isRunning ? "running" : "not started"} | Branch {orchestration.branch}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <label className="block text-xs text-slate-600">
            Task model
            <select
              value={config.taskModel}
              onChange={(event) =>
                onChange({ ...config, taskModel: event.target.value as ConfigModel, livePatchPending: true })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-600">
            Review model
            <select
              value={config.reviewModel}
              onChange={(event) =>
                onChange({ ...config, reviewModel: event.target.value as ConfigModel, livePatchPending: true })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-600">
            Plan writer model
            <select
              value={config.planModel}
              onChange={(event) =>
                onChange({ ...config, planModel: event.target.value as ConfigModel, livePatchPending: true })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-600">
            Review policy
            <select
              value={config.reviewPolicy}
              onChange={(event) =>
                onChange({ ...config, reviewPolicy: event.target.value as ReviewPolicy, livePatchPending: true })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value="agent_only">Agent only</option>
              <option value="hitl_optional">HITL optional</option>
              <option value="hitl_required">HITL required</option>
            </select>
          </label>

          <label className="block text-xs text-slate-600">
            Parallel task slots
            <input
              type="number"
              min={1}
              max={8}
              value={config.parallelism}
              onChange={(event) =>
                onChange({ ...config, parallelism: Number(event.target.value), livePatchPending: true })
              }
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {!isRunning ? (
            <button
              type="button"
              className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white"
            >
              Start orchestration
            </button>
          ) : (
            <button
              type="button"
              className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white"
            >
              Apply live config patch
            </button>
          )}
          <button
            type="button"
            className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
          >
            Open task-level overrides
          </button>
        </div>

        <p className="mt-2 text-[11px] text-slate-600">
          {config.livePatchPending
            ? "Unsaved config changes pending."
            : "Config synced."}
        </p>
      </div>
    </div>
  );
}

function PhaseRail({
  orchestration,
  selectedPhaseNumber,
  onSelectPhase,
}: {
  orchestration: OrchestrationDetail;
  selectedPhaseNumber: number;
  onSelectPhase: (phaseNumber: number) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Phase rail</p>
      <ul className="space-y-1">
        {orchestration.phases.map((phase) => {
          const selected = phase.phaseNumber === selectedPhaseNumber;
          const doneCount = phase.tasks.filter((task) => task.status === "done").length;

          return (
            <li key={phase.phaseNumber}>
              <button
                type="button"
                onClick={() => onSelectPhase(phase.phaseNumber)}
                className={[
                  "w-full rounded border px-2 py-2 text-left",
                  selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={selected ? "text-xs font-semibold text-white" : "text-xs font-semibold text-slate-800"}>
                    P{phase.phaseNumber} {phase.title}
                  </p>
                  <span
                    className={[
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      selected ? "bg-white/20 text-white" : orchestrationStatusTone[phase.status],
                    ].join(" ")}
                  >
                    {phase.status}
                  </span>
                </div>
                <p className={selected ? "mt-1 text-[11px] text-slate-100" : "mt-1 text-[11px] text-slate-600"}>
                  {phase.tasks.length} tasks | {doneCount} done | {phase.team.length} team
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  onQuicklook,
}: {
  tasks: PhaseTask[];
  selectedTaskId: string;
  onSelectTask: (taskId: string) => void;
  onQuicklook: (task: PhaseTask) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
        No tasks in this phase.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {tasks.map((task) => {
        const selected = task.id === selectedTaskId;

        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelectTask(task.id)}
            className={[
              "w-full rounded-lg border px-2 py-2 text-left",
              selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={selected ? "text-sm font-semibold text-white" : "text-sm font-semibold text-slate-900"}>
                    {task.id} {task.title}
                  </p>
                  <span
                    className={[
                      "rounded px-1.5 py-0.5 text-[11px] font-medium",
                      selected ? "bg-white/20 text-white" : taskStatusTone[task.status],
                    ].join(" ")}
                  >
                    {labelFromSnake(task.status)}
                  </span>
                </div>
                <p className={selected ? "mt-1 text-xs text-slate-100" : "mt-1 text-xs text-slate-600"}>
                  owner {task.owner} | est {task.estimate} | feedback {task.feedbackCount}
                </p>
                {task.blockedBy ? (
                  <p className={selected ? "mt-1 text-xs text-rose-100" : "mt-1 text-xs text-rose-700"}>
                    blocked: {task.blockedBy}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onQuicklook(task);
                }}
                className={
                  selected
                    ? "shrink-0 rounded border border-white/50 bg-white/20 px-2 py-1 text-xs text-white"
                    : "shrink-0 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                }
              >
                Quicklook
              </button>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TaskQuicklookModal({
  task,
  phase,
  onClose,
}: {
  task: PhaseTask;
  phase: OrchestrationPhase;
  onClose: () => void;
}) {
  const [owner, setOwner] = useState(task.owner);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [model, setModel] = useState<ConfigModel>("sonnet-4.5");
  const [feedback, setFeedback] = useState("Please confirm task scope before promoting to done.");

  const ownerOptions = Array.from(new Set([...phase.team, task.owner]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Task quicklook</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              {task.id} {task.title}
            </h3>
            <p className="mt-1 text-xs text-slate-600">Phase {phase.phaseNumber}: {phase.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Close
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            Owner
            <select
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              {ownerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-600">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value="todo">todo</option>
              <option value="in_progress">in progress</option>
              <option value="blocked">blocked</option>
              <option value="done">done</option>
            </select>
          </label>

          <label className="text-xs text-slate-600">
            Task model
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as ConfigModel)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              {modelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Dependencies</p>
          <ul className="mt-1 space-y-1">
            {task.dependencies.length > 0 ? (
              task.dependencies.map((dependency) => (
                <li key={dependency} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                  {dependency}
                </li>
              ))
            ) : (
              <li className="text-xs text-slate-600">No dependencies</li>
            )}
          </ul>
          {task.blockedBy ? (
            <p className="mt-2 text-xs text-rose-700">Blocked by: {task.blockedBy}</p>
          ) : null}
        </div>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Task feedback</p>
          <textarea
            rows={3}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            >
              Save task edits
            </button>
            <button
              type="button"
              className="rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white"
            >
              Send feedback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalPage({
  orchestration,
  phase,
  onBack,
}: {
  orchestration: OrchestrationDetail;
  phase: OrchestrationPhase;
  onBack: () => void;
}) {
  const endpoints = ["orchestrator", `phase-${phase.phaseNumber}-lead`, ...phase.team];
  const [endpoint, setEndpoint] = useState(endpoints[0]);

  const transcript = [
    `[connected] ${endpoint}`,
    "agent> Phase health is stable. 1 task blocked on plan clarification.",
    "you> explain blocker P3-T4",
    "agent> Blocked by unresolved ack semantics. Needs human review on plan line 12.",
  ];

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Terminal mode</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{orchestration.feature}</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Back to workspace
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <label className="block text-xs text-slate-600">
          Connect to
          <select
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          >
            {endpoints.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-2 h-[55vh] overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-100">
          {transcript.map((line) => (
            <p key={line} className="leading-5">
              {line}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function GitPanel({ phase }: { phase: OrchestrationPhase }) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Git</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">stacked</span>
      </div>

      <div className="space-y-2">
        <div className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Commits</p>
          <ul className="mt-1 space-y-1">
            {phase.git.commits.map((commit) => (
              <li key={commit} className="text-xs text-slate-700">
                {commit}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Diff summary</p>
          <p className="mt-1 text-xs text-slate-700">
            {phase.git.diffSummary.files} files | +{phase.git.diffSummary.additions} / -{phase.git.diffSummary.deletions}
          </p>
        </div>

        <div className="rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Files changed</p>
          <ul className="mt-1 space-y-1">
            {phase.git.files.map((file) => (
              <li key={file} className="text-xs text-slate-700">
                {file}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PhaseReviewPanel({
  phase,
  onOpenReview,
}: {
  phase: OrchestrationPhase;
  onOpenReview: (target: ReviewTarget) => void;
}) {
  const checklist = phase.reviewChecklist ?? [];

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Phase review</p>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">human + agent artifacts</span>
      </div>

      <ul className="space-y-2">
        {checklist.length > 0 ? (
          checklist.map((item) => (
            <li key={item.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                <span
                  className={[
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    item.status === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : item.status === "changes_requested"
                      ? "bg-rose-100 text-rose-800"
                      : item.status === "ready"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-amber-100 text-amber-800",
                  ].join(" ")}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">actor: {item.actor}</p>
              {item.planLine ? (
                <p className="mt-1 text-xs text-slate-600">plan line: L{item.planLine}</p>
              ) : null}
            </li>
          ))
        ) : (
          <li className="text-xs text-slate-600">No explicit review checklist for this phase.</li>
        )}
      </ul>

      <div className="mt-2 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => onOpenReview("phase_plan")}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        >
          Open phase review workspace
        </button>
        <button
          type="button"
          onClick={() => onOpenReview("code")}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        >
          Open code review workspace
        </button>
      </div>
    </section>
  );
}

function MarkdownLines({ plan }: { plan: PlanDocument }) {
  const lines = useMemo(() => plan.markdown.split("\n"), [plan.markdown]);

  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white p-2">
      <div className="min-w-[560px] space-y-0.5 font-mono text-xs">
        {lines.map((line, index) => {
          const lineNumber = index + 1;

          return (
            <div
              key={`${lineNumber}-${line}`}
              className="grid grid-cols-[48px_1fr] gap-2 rounded px-1 py-0.5"
            >
              <span className="text-right text-slate-400">{lineNumber}</span>
              <span className="whitespace-pre-wrap text-slate-700">{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffLines({ phase }: { phase: OrchestrationPhase }) {
  const lines = diffLinesForPhase(phase);

  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white p-2">
      <div className="min-w-[560px] space-y-0.5 font-mono text-xs">
        {lines.map((line, index) => (
          <div key={`${index}-${line}`} className="grid grid-cols-[48px_1fr] gap-2 rounded px-1 py-0.5">
            <span className="text-right text-slate-400">{index + 1}</span>
            <span className="whitespace-pre-wrap text-slate-700">{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectHistoryPage({
  project,
  onBack,
}: {
  project: string;
  onBack: () => void;
}) {
  const activeRuns = orchestrations.filter((orchestration) => orchestration.project === project);
  const allHistory = historyRuns.filter((run) => run.project === project);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project view</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{project} - all orchestrations</h3>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Back to workspace
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">Active</p>
        <ul className="mt-2 space-y-2">
          {activeRuns.map((run) => (
            <li key={run.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <p className="text-sm text-slate-900">{run.feature}</p>
              <p className="text-xs text-slate-600">{run.status} | P{run.currentPhase}/{run.totalPhases}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">History</p>
        <ul className="mt-2 space-y-2">
          {allHistory.map((run) => (
            <li key={run.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <p className="text-sm text-slate-900">{run.feature}</p>
              <p className="text-xs text-slate-600">{run.ended} | {run.outcome}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReviewPage({
  orchestration,
  phase,
  target,
  onTargetChange,
  onBack,
}: {
  orchestration: OrchestrationDetail;
  phase: OrchestrationPhase;
  target: ReviewTarget;
  onTargetChange: (target: ReviewTarget) => void;
  onBack: () => void;
}) {
  const [reviewActor, setReviewActor] = useState<ReviewActor>("human");
  const [planView, setPlanView] = useState<PlanView>("preview");
  const [draftLine, setDraftLine] = useState("12");
  const [draftComment, setDraftComment] = useState(
    "Please verify this line meets both agent and human review expectations.",
  );

  const designPlan = getDesignPlan(orchestration.id);
  const phasePlan = getPhasePlan(orchestration.id, phase.phaseNumber);
  const activePlan = target === "design_plan" ? designPlan : target === "phase_plan" ? phasePlan : undefined;

  const threads = reviewThreads.filter(
    (thread) =>
      thread.orchestrationId === orchestration.id &&
      thread.target === target &&
      (thread.phaseNumber === undefined || thread.phaseNumber === phase.phaseNumber),
  );

  const artifacts = reviewArtifacts.filter((artifact) => artifact.orchestrationId === orchestration.id);

  const sectionList =
    target === "code"
      ? phase.git.files
      : (activePlan?.markdown.split("\n").filter((line) => line.startsWith("## ")) ?? ["## Overview"]);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Review workspace</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{orchestration.feature}</h3>
            <p className="mt-1 text-xs text-slate-600">Phase {phase.phaseNumber}: {phase.title}</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Back to workspace
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTargetChange("code")}
            className={[
              "rounded border px-2 py-1 text-xs",
              target === "code" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700",
            ].join(" ")}
          >
            Code review
          </button>
          <button
            type="button"
            onClick={() => onTargetChange("design_plan")}
            className={[
              "rounded border px-2 py-1 text-xs",
              target === "design_plan" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700",
            ].join(" ")}
          >
            Design plan review
          </button>
          <button
            type="button"
            onClick={() => onTargetChange("phase_plan")}
            className={[
              "rounded border px-2 py-1 text-xs",
              target === "phase_plan" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700",
            ].join(" ")}
          >
            Phase plan review
          </button>

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-slate-600">Reviewer</label>
            <select
              value={reviewActor}
              onChange={(event) => setReviewActor(event.target.value as ReviewActor)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            >
              <option value="human">human</option>
              <option value="agent">agent</option>
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-2 xl:grid-cols-[230px_1fr_320px]">
        <div className="rounded-xl border border-slate-300 bg-white p-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {target === "code" ? "Files" : "Sections"}
          </p>
          <ul className="mt-2 space-y-1">
            {sectionList.map((section) => (
              <li key={section} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                {section}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          {target === "code" ? <DiffLines phase={phase} /> : null}
          {target !== "code" && activePlan ? <MarkdownLines plan={activePlan} /> : null}
          {target !== "code" && !activePlan ? (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
              No plan document found for this target.
            </div>
          ) : null}

          {target !== "code" && activePlan ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPlanView("preview")}
                className={[
                  "rounded border px-2 py-1 text-xs",
                  planView === "preview"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700",
                ].join(" ")}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setPlanView("comments")}
                className={[
                  "rounded border px-2 py-1 text-xs",
                  planView === "comments"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700",
                ].join(" ")}
              >
                Comments
              </button>
              <span className="my-auto text-xs text-slate-600">Path: {activePlan.path}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <section className="rounded-xl border border-slate-300 bg-white p-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Review threads</p>
            <ul className="mt-2 space-y-2">
              {threads.length > 0 ? (
                threads.map((thread) => (
                  <li key={thread.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">{thread.section} L{thread.line}</p>
                      <span
                        className={[
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          thread.state === "open"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800",
                        ].join(" ")}
                      >
                        {thread.state}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{thread.comment}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{thread.author} | {thread.createdAgo}</p>
                  </li>
                ))
              ) : (
                <li className="text-xs text-slate-600">No threads yet.</li>
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-300 bg-white p-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Add review comment</p>
            <label className="mt-2 block text-xs text-slate-600">
              Line
              <input
                value={draftLine}
                onChange={(event) => setDraftLine(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              />
            </label>
            <label className="mt-2 block text-xs text-slate-600">
              Comment
              <textarea
                rows={3}
                value={draftComment}
                onChange={(event) => setDraftComment(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              />
            </label>
            <button
              type="button"
              className="mt-2 w-full rounded border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-medium text-white"
            >
              Save review artifact as {reviewActor}
            </button>
          </section>
        </div>
      </section>

      <section className="rounded-xl border border-slate-300 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">Review artifacts</p>
        <ul className="mt-2 space-y-2">
          {artifacts.map((artifact) => (
            <li key={artifact.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
              <p className="text-xs font-semibold text-slate-800">
                {artifact.target} | {artifact.outcome}
              </p>
              <p className="mt-1 text-xs text-slate-700">{artifact.summary}</p>
              <p className="mt-1 text-[11px] text-slate-500">{artifact.actor} | {artifact.createdAgo}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function TinaOrchestrationConsoleSet() {
  const defaultOrchestration =
    orchestrations.find((orchestration) => orchestration.status === "executing") ??
    orchestrations[0]!;
  const scenarioBaseline =
    orchestrations.find((orchestration) => orchestration.feature === "Scenario reliability baseline") ??
    orchestrations[0]!;

  const [screen, setScreen] = useState<Screen>("workspace");
  const [selectedOrchestrationId, setSelectedOrchestrationId] = useState<string>(defaultOrchestration.id);
  const [historyProject, setHistoryProject] = useState<string>(projectNav[0]?.project ?? "");
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>("code");
  const [phaseOverrideByOrchestration, setPhaseOverrideByOrchestration] = useState<Record<string, number>>({});
  const [selectedTaskByContext, setSelectedTaskByContext] = useState<Record<string, string>>({});
  const [quicklookTask, setQuicklookTask] = useState<PhaseTask | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configByOrchestrationId, setConfigByOrchestrationId] = useState<Record<string, OrchestrationConfig>>(
    initialConfigByOrchestrationId,
  );

  const selectedOrchestration =
    orchestrations.find((orchestration) => orchestration.id === selectedOrchestrationId) ??
    orchestrations[0];

  if (!selectedOrchestration) {
    return null;
  }

  const selectedPhaseNumber =
    phaseOverrideByOrchestration[selectedOrchestration.id] ?? selectedOrchestration.currentPhase;

  const selectedPhase =
    selectedOrchestration.phases.find((phase) => phase.phaseNumber === selectedPhaseNumber) ??
    selectedOrchestration.phases[0];

  if (!selectedPhase) {
    return null;
  }

  const config = configByOrchestrationId[selectedOrchestration.id] ?? initialConfigByOrchestrationId["orch-1001"];

  const taskKey = contextKey(selectedOrchestration.id, selectedPhase.phaseNumber);
  const selectedTaskId = selectedTaskByContext[taskKey] ?? selectedPhase.tasks[0]?.id ?? "";

  const selectOrchestration = (orchestrationId: string) => {
    setSelectedOrchestrationId(orchestrationId);
    setScreen("workspace");
    setQuicklookTask(null);
    setConfigModalOpen(false);
  };

  const openProjectHistory = (project: string) => {
    setHistoryProject(project);
    setScreen("project-history");
    setConfigModalOpen(false);
  };

  const setPhase = (phaseNumber: number) => {
    setPhaseOverrideByOrchestration((current) => ({
      ...current,
      [selectedOrchestration.id]: phaseNumber,
    }));
    setQuicklookTask(null);
  };

  const setTask = (taskId: string) => {
    setSelectedTaskByContext((current) => ({
      ...current,
      [taskKey]: taskId,
    }));
  };

  const openReview = (target: ReviewTarget) => {
    setReviewTarget(target);
    setScreen("review");
    setConfigModalOpen(false);
  };

  const openTerminal = () => {
    setScreen("terminal");
    setConfigModalOpen(false);
  };

  const openSettings = () => {
    setConfigModalOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">wireframe iteration</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Option C base: configurable orchestration workspace + chat terminal
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            Added task edit/feedback in quicklook, compact context, run-time configuration controls, and
            endpoint-based chat terminal for orchestrator/team communication.
          </p>
        </section>

        <section className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <Sidebar
            selectedOrchestrationId={selectedOrchestration.id}
            onSelectOrchestration={selectOrchestration}
            onViewAll={openProjectHistory}
          />

          {screen === "workspace" ? (
            <div className="grid gap-3 xl:grid-cols-[1fr_330px]">
              <div className="space-y-3">
                <section className="rounded-xl border border-slate-300 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Phase/task workspace</p>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      task detail via quicklook modal
                    </span>
                  </div>

                  <div className="grid gap-2 xl:grid-cols-[240px_1fr]">
                    <PhaseRail
                      orchestration={selectedOrchestration}
                      selectedPhaseNumber={selectedPhase.phaseNumber}
                      onSelectPhase={setPhase}
                    />
                    <TaskList
                      tasks={selectedPhase.tasks}
                      selectedTaskId={selectedTaskId}
                      onSelectTask={setTask}
                      onQuicklook={setQuicklookTask}
                    />
                  </div>
                </section>
              </div>

              <div className="space-y-3">
                <CompactContextWidget
                  baseline={scenarioBaseline}
                  orchestration={selectedOrchestration}
                  phase={selectedPhase}
                  onFocusBaseline={() => selectOrchestration(scenarioBaseline.id)}
                  onOpenReview={openReview}
                  onOpenTerminal={openTerminal}
                  onOpenSettings={openSettings}
                />
                <PhaseReviewPanel phase={selectedPhase} onOpenReview={openReview} />
                <GitPanel phase={selectedPhase} />
                <button
                  type="button"
                  onClick={openTerminal}
                  className="rounded border border-slate-900 bg-slate-900 px-2 py-1.5 text-xs font-medium text-white"
                >
                  Open full terminal
                </button>
              </div>
            </div>
          ) : null}

          {screen === "terminal" ? (
            <TerminalPage
              key={`${selectedOrchestration.id}-${selectedPhase.phaseNumber}`}
              orchestration={selectedOrchestration}
              phase={selectedPhase}
              onBack={() => setScreen("workspace")}
            />
          ) : null}

          {screen === "project-history" ? (
            <ProjectHistoryPage
              project={historyProject}
              onBack={() => setScreen("workspace")}
            />
          ) : null}

          {screen === "review" ? (
            <ReviewPage
              orchestration={selectedOrchestration}
              phase={selectedPhase}
              target={reviewTarget}
              onTargetChange={setReviewTarget}
              onBack={() => setScreen("workspace")}
            />
          ) : null}
        </section>
      </div>

      {quicklookTask ? (
        <TaskQuicklookModal
          task={quicklookTask}
          phase={selectedPhase}
          onClose={() => setQuicklookTask(null)}
        />
      ) : null}

      {configModalOpen ? (
        <OrchestrationConfigModal
          orchestration={selectedOrchestration}
          config={config}
          onChange={(next) =>
            setConfigByOrchestrationId((current) => ({
              ...current,
              [selectedOrchestration.id]: next,
            }))
          }
          onClose={() => setConfigModalOpen(false)}
        />
      ) : null}
    </>
  );
}
