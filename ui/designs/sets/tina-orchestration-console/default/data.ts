export type OrchestrationStatus =
  | "planning"
  | "executing"
  | "reviewing"
  | "blocked"
  | "complete";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export type ReviewActor = "agent" | "human";
export type ReviewDecision = "pending" | "ready" | "approved" | "changes_requested";

export type ProjectNavItem = {
  project: string;
  repoPath: string;
  active: string[];
  recent: string[];
  totalHistory: number;
};

export type PhaseTask = {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
  estimate: string;
  blockedBy?: string;
  dependencies: string[];
  feedbackCount: number;
};

export type GitSnapshot = {
  commits: string[];
  diffSummary: {
    files: number;
    additions: number;
    deletions: number;
  };
  files: string[];
};

export type PhaseReviewItem = {
  id: string;
  title: string;
  actor: ReviewActor;
  status: ReviewDecision;
  note: string;
  planLine?: number;
};

export type OrchestrationPhase = {
  phaseNumber: number;
  title: string;
  status: OrchestrationStatus;
  team: string[];
  tasks: PhaseTask[];
  git: GitSnapshot;
  events: string[];
  implementationPlanPath: string;
  reviewChecklist?: PhaseReviewItem[];
};

export type OrchestrationDetail = {
  id: string;
  project: string;
  feature: string;
  status: OrchestrationStatus;
  currentPhase: number;
  totalPhases: number;
  elapsed: string;
  branch: string;
  lastEventAge: string;
  stale: boolean;
  designPlanPath: string;
  phases: OrchestrationPhase[];
};

export type HistoryRun = {
  id: string;
  project: string;
  feature: string;
  ended: string;
  outcome: "complete" | "blocked";
};

export type PlanComment = {
  id: string;
  line: number;
  author: "human" | "agent";
  text: string;
  state: "open" | "resolved";
  createdAgo: string;
};

export type PlanDocument = {
  id: string;
  kind: "design" | "phase";
  orchestrationId: string;
  phaseNumber?: number;
  title: string;
  path: string;
  updatedAgo: string;
  markdown: string;
  comments: PlanComment[];
};

export const projectNav: ProjectNavItem[] = [
  {
    project: "tina-core",
    repoPath: "/Users/joshua/Projects/tina",
    active: ["Daemon failover hardening", "Request handoff"],
    recent: ["CLI profile switching", "Session recovery replay", "Monitor event pruning"],
    totalHistory: 42,
  },
  {
    project: "tina-plugin",
    repoPath: "/Users/joshua/Projects/tina-plugin",
    active: ["Marketplace bundle signing"],
    recent: ["Plugin install diagnostics", "Market sync policy", "Release train cleanup"],
    totalHistory: 18,
  },
  {
    project: "tina-harness",
    repoPath: "/Users/joshua/Projects/tina-harness",
    active: ["Scenario reliability baseline"],
    recent: ["Timeout probe matrix", "Result snapshot diff", "Failure replay mode"],
    totalHistory: 26,
  },
];

export const orchestrations: OrchestrationDetail[] = [
  {
    id: "orch-1009",
    project: "tina-core",
    feature: "Request handoff",
    status: "executing",
    currentPhase: 3,
    totalPhases: 5,
    elapsed: "46m",
    branch: "codex/request-handoff",
    lastEventAge: "2m",
    stale: false,
    designPlanPath: "docs/plans/request-queue-handoff-design.md",
    phases: [
      {
        phaseNumber: 1,
        title: "Design alignment",
        status: "complete",
        team: ["planner", "architect"],
        implementationPlanPath: "docs/plans/request-queue-handoff/p1-plan.md",
        tasks: [
          {
            id: "P1-T1",
            title: "Validate feedback ingestion boundaries",
            owner: "planner",
            status: "done",
            estimate: "20m",
            dependencies: [],
            feedbackCount: 1,
          },
          {
            id: "P1-T2",
            title: "Define teammate queue ownership",
            owner: "architect",
            status: "done",
            estimate: "25m",
            dependencies: ["P1-T1"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["c03f2d8 add queue ownership notes", "e68ad7a align action lifecycle docs"],
          diffSummary: { files: 5, additions: 112, deletions: 27 },
          files: ["docs/plans/request-queue.md", "skills/orchestrate/SKILL.md", "README.md"],
        },
        events: ["Design approved by architect", "Phase reviewer marked complete"],
      },
      {
        phaseNumber: 2,
        title: "Plan generation",
        status: "complete",
        team: ["planner", "team-lead"],
        implementationPlanPath: "docs/plans/request-queue-handoff/p2-plan.md",
        tasks: [
          {
            id: "P2-T1",
            title: "Create execution task graph",
            owner: "planner",
            status: "done",
            estimate: "35m",
            dependencies: [],
            feedbackCount: 2,
          },
          {
            id: "P2-T2",
            title: "Assign implementers and reviewer",
            owner: "team-lead",
            status: "done",
            estimate: "15m",
            dependencies: ["P2-T1"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["f3e1dc0 add phase plan yaml", "9d12554 annotate retry policy"],
          diffSummary: { files: 6, additions: 158, deletions: 44 },
          files: ["docs/plans/request-queue-plan.md", "tina-session/src/commands/mod.rs", "tests/subagent-driven-dev/run-test.sh"],
        },
        events: ["Planner produced 8 tasks", "Team lead accepted plan"],
      },
      {
        phaseNumber: 3,
        title: "Execution",
        status: "executing",
        team: ["team-lead", "implementer-a", "implementer-b", "spec-reviewer"],
        implementationPlanPath: "docs/plans/request-queue-handoff/p3-plan.md",
        reviewChecklist: [
          {
            id: "p3-r1",
            title: "Validate transition contract in integration tests",
            actor: "agent",
            status: "ready",
            note: "Spec reviewer can start once ack semantics are finalized.",
            planLine: 17,
          },
          {
            id: "p3-r2",
            title: "Human sign-off on ack semantics before unblocking P3-T4",
            actor: "human",
            status: "pending",
            note: "Plan calls for explicit human-in-the-loop validation.",
            planLine: 12,
          },
          {
            id: "p3-r3",
            title: "Human sign-off on rollback behavior",
            actor: "human",
            status: "pending",
            note: "Confirm rollback conditions align with production expectations.",
            planLine: 23,
          },
        ],
        tasks: [
          {
            id: "P3-T1",
            title: "Persist feedback payload to queue",
            owner: "implementer-a",
            status: "done",
            estimate: "45m",
            dependencies: ["P2-T1"],
            feedbackCount: 1,
          },
          {
            id: "P3-T2",
            title: "Add teammate triage loop",
            owner: "implementer-b",
            status: "in_progress",
            estimate: "60m",
            dependencies: ["P3-T1"],
            feedbackCount: 3,
          },
          {
            id: "P3-T3",
            title: "Queue status badges in monitor",
            owner: "implementer-a",
            status: "todo",
            estimate: "35m",
            dependencies: ["P3-T1"],
            feedbackCount: 0,
          },
          {
            id: "P3-T4",
            title: "Contract test for queue transitions",
            owner: "spec-reviewer",
            status: "blocked",
            estimate: "40m",
            blockedBy: "Need ack semantics in plan section 4",
            dependencies: ["P3-T2"],
            feedbackCount: 2,
          },
        ],
        git: {
          commits: [
            "b92ae13 add queue ingestion worker",
            "4e332f1 expose queue states in convex",
            "f4089c5 wire request queue cards",
          ],
          diffSummary: { files: 14, additions: 382, deletions: 96 },
          files: [
            "convex/actions.ts",
            "convex/schema.ts",
            "tina-web/src/components/OrchestrationControls.tsx",
            "tina-web/src/components/RequestQueue.tsx",
            "tina-session/src/commands/daemon.rs",
          ],
        },
        events: [
          "implementer-b requested retry for flaky test",
          "spec-reviewer opened blocker on queue ack semantics",
          "team-lead nudged task owner for triage",
        ],
      },
      {
        phaseNumber: 4,
        title: "Phase review",
        status: "planning",
        team: ["phase-reviewer"],
        implementationPlanPath: "docs/plans/request-queue-handoff/p4-plan.md",
        reviewChecklist: [
          {
            id: "p4-r1",
            title: "Phase reviewer confirms acceptance criteria coverage",
            actor: "agent",
            status: "pending",
            note: "Requires all execution tasks complete.",
          },
          {
            id: "p4-r2",
            title: "Human review for release readiness gate",
            actor: "human",
            status: "pending",
            note: "Optional gate can be required by plan.",
          },
        ],
        tasks: [
          {
            id: "P4-T1",
            title: "Validate queue handoff criteria",
            owner: "phase-reviewer",
            status: "todo",
            estimate: "30m",
            dependencies: ["P3-T2", "P3-T4"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["pending"],
          diffSummary: { files: 0, additions: 0, deletions: 0 },
          files: ["No files yet"],
        },
        events: ["Awaiting execution completion"],
      },
      {
        phaseNumber: 5,
        title: "Wrap-up",
        status: "planning",
        team: ["team-lead"],
        implementationPlanPath: "docs/plans/request-queue-handoff/p5-plan.md",
        tasks: [
          {
            id: "P5-T1",
            title: "Prepare branch finishing workflow",
            owner: "team-lead",
            status: "todo",
            estimate: "20m",
            dependencies: ["P4-T1"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["pending"],
          diffSummary: { files: 0, additions: 0, deletions: 0 },
          files: ["No files yet"],
        },
        events: ["Not started"],
      },
    ],
  },
  {
    id: "orch-998",
    project: "tina-plugin",
    feature: "Marketplace bundle signing",
    status: "blocked",
    currentPhase: 2,
    totalPhases: 4,
    elapsed: "31m",
    branch: "codex/plugin-bundle-signing",
    lastEventAge: "12m",
    stale: true,
    designPlanPath: "docs/plans/plugin-bundle-signing-design.md",
    phases: [
      {
        phaseNumber: 1,
        title: "Design alignment",
        status: "complete",
        team: ["planner", "architect"],
        implementationPlanPath: "docs/plans/plugin-bundle-signing/p1-plan.md",
        tasks: [
          {
            id: "P1-T1",
            title: "Confirm release constraints",
            owner: "planner",
            status: "done",
            estimate: "20m",
            dependencies: [],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["76d19e1 capture signing assumptions"],
          diffSummary: { files: 2, additions: 48, deletions: 7 },
          files: ["docs/plans/plugin-signing.md"],
        },
        events: ["Design accepted"],
      },
      {
        phaseNumber: 2,
        title: "Execution",
        status: "blocked",
        team: ["team-lead", "implementer"],
        implementationPlanPath: "docs/plans/plugin-bundle-signing/p2-plan.md",
        reviewChecklist: [
          {
            id: "plugin-p2-r1",
            title: "Agent review of fallback behavior",
            actor: "agent",
            status: "pending",
            note: "Blocked until key availability is resolved.",
          },
          {
            id: "plugin-p2-r2",
            title: "Human security review for signing assumptions",
            actor: "human",
            status: "pending",
            note: "Required before approval in protected environments.",
          },
        ],
        tasks: [
          {
            id: "P2-T1",
            title: "Integrate signature verifier",
            owner: "implementer",
            status: "blocked",
            estimate: "55m",
            blockedBy: "Signing key unavailable",
            dependencies: ["P1-T1"],
            feedbackCount: 2,
          },
          {
            id: "P2-T2",
            title: "Add retry fallback",
            owner: "team-lead",
            status: "todo",
            estimate: "30m",
            dependencies: ["P2-T1"],
            feedbackCount: 1,
          },
        ],
        git: {
          commits: ["dd923fa start verifier adapter"],
          diffSummary: { files: 4, additions: 96, deletions: 39 },
          files: ["scripts/build-plugin-bundle.sh", "marketplace.json", "tina-session/src/config.rs"],
        },
        events: ["Blocked waiting for signing key", "No new events for 12m"],
      },
      {
        phaseNumber: 3,
        title: "Review",
        status: "planning",
        team: ["phase-reviewer"],
        implementationPlanPath: "docs/plans/plugin-bundle-signing/p3-plan.md",
        tasks: [
          {
            id: "P3-T1",
            title: "Review signing path",
            owner: "phase-reviewer",
            status: "todo",
            estimate: "20m",
            dependencies: ["P2-T2"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["pending"],
          diffSummary: { files: 0, additions: 0, deletions: 0 },
          files: ["No files yet"],
        },
        events: ["Awaiting unblock"],
      },
      {
        phaseNumber: 4,
        title: "Wrap-up",
        status: "planning",
        team: ["team-lead"],
        implementationPlanPath: "docs/plans/plugin-bundle-signing/p4-plan.md",
        tasks: [
          {
            id: "P4-T1",
            title: "Prepare release note",
            owner: "team-lead",
            status: "todo",
            estimate: "20m",
            dependencies: ["P3-T1"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["pending"],
          diffSummary: { files: 0, additions: 0, deletions: 0 },
          files: ["No files yet"],
        },
        events: ["Not started"],
      },
    ],
  },
  {
    id: "orch-1001",
    project: "tina-harness",
    feature: "Scenario reliability baseline",
    status: "reviewing",
    currentPhase: 3,
    totalPhases: 3,
    elapsed: "58m",
    branch: "codex/harness-reliability-baseline",
    lastEventAge: "4m",
    stale: false,
    designPlanPath: "docs/plans/harness-reliability-baseline-design.md",
    phases: [
      {
        phaseNumber: 1,
        title: "Planning",
        status: "complete",
        team: ["planner"],
        implementationPlanPath: "docs/plans/harness-reliability-baseline/p1-plan.md",
        tasks: [
          {
            id: "P1-T1",
            title: "Select baseline scenarios",
            owner: "planner",
            status: "done",
            estimate: "20m",
            dependencies: [],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["5b629c2 baseline scenario matrix"],
          diffSummary: { files: 3, additions: 61, deletions: 12 },
          files: ["tests/skill-triggering/run-all.sh", "docs/harness-baseline.md"],
        },
        events: ["Plan approved"],
      },
      {
        phaseNumber: 2,
        title: "Execution",
        status: "complete",
        team: ["implementer", "spec-reviewer"],
        implementationPlanPath: "docs/plans/harness-reliability-baseline/p2-plan.md",
        tasks: [
          {
            id: "P2-T1",
            title: "Add deterministic seeds",
            owner: "implementer",
            status: "done",
            estimate: "40m",
            dependencies: ["P1-T1"],
            feedbackCount: 1,
          },
          {
            id: "P2-T2",
            title: "Assert timeout ceilings",
            owner: "spec-reviewer",
            status: "done",
            estimate: "25m",
            dependencies: ["P2-T1"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["aa27e77 add deterministic seed helper", "d2196f4 tighten timeout assertions"],
          diffSummary: { files: 7, additions: 204, deletions: 65 },
          files: ["tina-harness/src/commands/verify.rs", "tina-harness/src/commands/run.rs"],
        },
        events: ["Execution complete"],
      },
      {
        phaseNumber: 3,
        title: "Review",
        status: "reviewing",
        team: ["phase-reviewer", "code-reviewer"],
        implementationPlanPath: "docs/plans/harness-reliability-baseline/p3-plan.md",
        reviewChecklist: [
          {
            id: "harness-p3-r1",
            title: "Agent verifies flake-rate trend",
            actor: "agent",
            status: "ready",
            note: "Data already collected by phase reviewer.",
          },
          {
            id: "harness-p3-r2",
            title: "Human sign-off on reproducibility report",
            actor: "human",
            status: "pending",
            note: "Required when plans request human in the loop.",
          },
        ],
        tasks: [
          {
            id: "P3-T1",
            title: "Compare before and after flake rate",
            owner: "phase-reviewer",
            status: "in_progress",
            estimate: "30m",
            dependencies: ["P2-T2"],
            feedbackCount: 1,
          },
          {
            id: "P3-T2",
            title: "Request final verification",
            owner: "code-reviewer",
            status: "todo",
            estimate: "15m",
            dependencies: ["P3-T1"],
            feedbackCount: 0,
          },
        ],
        git: {
          commits: ["61b7bd3 wire result snapshots to report"],
          diffSummary: { files: 4, additions: 88, deletions: 17 },
          files: ["tina-harness/src/main.rs", "tests/subagent-driven-dev/svelte-todo/plan.md"],
        },
        events: ["Review in progress", "Awaiting human sign-off"],
      },
    ],
  },
];

export const historyRuns: HistoryRun[] = [
  {
    id: "hist-204",
    project: "tina-core",
    feature: "Session recovery replay",
    ended: "Today 14:10",
    outcome: "complete",
  },
  {
    id: "hist-201",
    project: "tina-core",
    feature: "CLI profile switching",
    ended: "Today 11:22",
    outcome: "complete",
  },
  {
    id: "hist-188",
    project: "tina-core",
    feature: "Monitor event pruning",
    ended: "Yesterday 17:03",
    outcome: "blocked",
  },
  {
    id: "hist-177",
    project: "tina-plugin",
    feature: "Plugin install diagnostics",
    ended: "Yesterday 09:44",
    outcome: "complete",
  },
  {
    id: "hist-171",
    project: "tina-harness",
    feature: "Timeout probe matrix",
    ended: "Yesterday 08:28",
    outcome: "complete",
  },
];

const designPlanText = `# Request Handoff Design

## Goals
- Single queue for human + agent feedback.
- Every item links to a plan line or task.
- Triage does not block execution.

## Flow
1. Feedback becomes a queue item.
2. Teammate triages state.
3. Applied items emit an orchestration event.

## Acceptance
- new -> triaged -> applied/rejected states.
- Stale when no orchestration events for 10 minutes.
`;

const phasePlanText = `# Phase 3 Implementation Plan

## Objective
Implement queue-backed feedback handling for execution tasks and plan comments.

## Task Graph
- P3-T1 Persist feedback payload to queue table.
- P3-T2 Add teammate triage loop and queue state updates.
- P3-T3 Surface queue badges in orchestration monitor.
- P3-T4 Add contract tests for queue transitions.

## Sequencing
1. Merge P3-T1 before any triage logic.
2. Start P3-T2 and P3-T3 in parallel after P3-T1.
3. Keep P3-T4 blocked until ack semantics are finalized.

## Review Checks
- Verify queue state transitions in unit tests.
- Verify monitor badge rendering for all states.
- Verify comments on plan lines generate queue items.

## Rollback
- Gate feature behind queue_enabled flag.
- If failures increase, disable queue ingestion and fall back to legacy feedback path.
`;

const pluginDesignPlanText = `# Marketplace Bundle Signing Design

## Objective
Add signature verification to plugin bundle flow while preserving release speed.

## Risks
- Signing key delays.
- Incomplete fallback behavior.

## Plan
- Implement verifier adapter.
- Add fallback with explicit queue alert.
`;

const pluginPhasePlanText = `# Phase 2 Execution Plan

## Tasks
- P2-T1 Integrate signature verifier.
- P2-T2 Add retry fallback.

## Blockers
- Signing key unavailable in runtime environment.
`;

const harnessDesignPlanText = `# Harness Reliability Baseline Design

## Objective
Reduce flaky scenario runs by enforcing deterministic setup.

## Strategy
- Seed random operations.
- Tighten timeout assertions.
- Capture snapshot diffs for failures.
`;

const harnessPhasePlanText = `# Phase 3 Review Plan

## Review Work
- Compare before and after flake rate.
- Verify timeout ceiling behavior.
- Confirm reproducibility across machines.
`;

export const planDocuments: PlanDocument[] = [
  {
    id: "plan-design-orch-1009",
    kind: "design",
    orchestrationId: "orch-1009",
    title: "Design Plan",
    path: "docs/plans/request-queue-handoff-design.md",
    updatedAgo: "9m ago",
    markdown: designPlanText,
    comments: [
      {
        id: "c-1",
        line: 14,
        author: "human",
        text: "Make teammate ownership explicit when both human and agent submit at once.",
        state: "open",
        createdAgo: "5m ago",
      },
      {
        id: "c-2",
        line: 24,
        author: "agent",
        text: "Acceptance should include plan-comment to queue item mapping.",
        state: "resolved",
        createdAgo: "18m ago",
      },
    ],
  },
  {
    id: "plan-phase-orch-1009-p3",
    kind: "phase",
    orchestrationId: "orch-1009",
    phaseNumber: 3,
    title: "Phase 3 Implementation Plan",
    path: "docs/plans/request-queue-handoff/p3-plan.md",
    updatedAgo: "2m ago",
    markdown: phasePlanText,
    comments: [
      {
        id: "c-3",
        line: 12,
        author: "human",
        text: "Call out exact contract for ack semantics before unblocking P3-T4.",
        state: "open",
        createdAgo: "1m ago",
      },
      {
        id: "c-4",
        line: 23,
        author: "agent",
        text: "Rollback step should include monitoring thresholds to watch.",
        state: "open",
        createdAgo: "3m ago",
      },
    ],
  },
  {
    id: "plan-design-orch-998",
    kind: "design",
    orchestrationId: "orch-998",
    title: "Design Plan",
    path: "docs/plans/plugin-bundle-signing-design.md",
    updatedAgo: "21m ago",
    markdown: pluginDesignPlanText,
    comments: [],
  },
  {
    id: "plan-phase-orch-998-p2",
    kind: "phase",
    orchestrationId: "orch-998",
    phaseNumber: 2,
    title: "Phase 2 Execution Plan",
    path: "docs/plans/plugin-bundle-signing/p2-plan.md",
    updatedAgo: "16m ago",
    markdown: pluginPhasePlanText,
    comments: [],
  },
  {
    id: "plan-design-orch-1001",
    kind: "design",
    orchestrationId: "orch-1001",
    title: "Design Plan",
    path: "docs/plans/harness-reliability-baseline-design.md",
    updatedAgo: "7m ago",
    markdown: harnessDesignPlanText,
    comments: [],
  },
  {
    id: "plan-phase-orch-1001-p3",
    kind: "phase",
    orchestrationId: "orch-1001",
    phaseNumber: 3,
    title: "Phase 3 Review Plan",
    path: "docs/plans/harness-reliability-baseline/p3-plan.md",
    updatedAgo: "4m ago",
    markdown: harnessPhasePlanText,
    comments: [],
  },
];

export function getDesignPlan(orchestrationId: string): PlanDocument | undefined {
  return planDocuments.find(
    (plan) => plan.kind === "design" && plan.orchestrationId === orchestrationId,
  );
}

export function getPhasePlan(
  orchestrationId: string,
  phaseNumber: number,
): PlanDocument | undefined {
  return planDocuments.find(
    (plan) =>
      plan.kind === "phase" &&
      plan.orchestrationId === orchestrationId &&
      plan.phaseNumber === phaseNumber,
  );
}
