export type SurfaceState = "normal" | "loading" | "empty" | "error";

export type ReviewState = "open" | "changes_requested" | "approved" | "superseded";

export type GateId = "plan" | "review" | "finalize";
export type GateStatus = "blocked" | "pending" | "approved";

export type FindingSeverity = "p0" | "p1" | "p2";
export type ThreadStatus = "unresolved" | "resolved";
export type ThreadSource = "human" | "agent";

export type ReviewFileStatus = "modified" | "added" | "deleted";
export type DiffRowKind = "context" | "added" | "removed" | "modified";

export type ReviewMetric = {
  label: string;
  value: string;
  note: string;
};

export type DiffRow = {
  id: string;
  oldLine: number | null;
  newLine: number | null;
  oldText: string;
  newText: string;
  kind: DiffRowKind;
};

export type ReviewFile = {
  path: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  owner: string;
  latestCommitSha: string;
  diffRows: DiffRow[];
};

export type ReviewCommit = {
  sha: string;
  title: string;
  author: string;
  timeAgo: string;
  status: "passing" | "failing" | "pending";
  filesChanged: number;
};

export type ReviewThread = {
  id: string;
  filePath: string;
  line: number;
  summary: string;
  body: string;
  severity: FindingSeverity;
  status: ThreadStatus;
  source: ThreadSource;
  author: string;
  updatedAgo: string;
  commitSha: string;
  gateImpact: GateId;
};

export type AgentReviewRun = {
  id: string;
  model: string;
  status: "ingesting" | "ready" | "failed";
  findings: number;
  startedAgo: string;
  duration: string;
  note: string;
};

export type HitlGate = {
  id: GateId;
  label: string;
  status: GateStatus;
  owner: string;
  due: string;
  summary: string;
};

export type ControlAction = {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
};

export const reviewContext = {
  orchestrationId: "orch-2488",
  projectLabel: "Project 4 Mechanical Review Workbench",
  prLabel: "PR-418 tina-web: mechanical review workbench",
  branch: "codex/project4-review-workbench",
  reviewOwner: "joshua",
};

export const reviewMetrics: ReviewMetric[] = [
  {
    label: "Unresolved findings",
    value: "12",
    note: "5 blocking before review gate can pass",
  },
  {
    label: "Agent findings ingested",
    value: "28",
    note: "3 superseded by newer commit",
  },
  {
    label: "Threads resolved today",
    value: "16",
    note: "Median resolve time 14m",
  },
  {
    label: "Gate checkpoints",
    value: "2/3",
    note: "Finalize gate waiting for explicit approval",
  },
];

export const reviewFiles: ReviewFile[] = [
  {
    path: "tina-web/src/components/review/WorkbenchShell.tsx",
    status: "modified",
    additions: 184,
    deletions: 37,
    owner: "agent-ui",
    latestCommitSha: "a8f12d4",
    diffRows: [
      {
        id: "wb-1",
        oldLine: 137,
        newLine: 137,
        oldText: "  <HeaderBar title={title} />",
        newText: "  <HeaderBar title={title} />",
        kind: "context",
      },
      {
        id: "wb-2",
        oldLine: 138,
        newLine: 138,
        oldText: "  <LegacyReviewSummary unresolved={unresolvedThreads} />",
        newText: "  <ReviewStateBadge state={reviewState} />",
        kind: "modified",
      },
      {
        id: "wb-3",
        oldLine: null,
        newLine: 139,
        oldText: "",
        newText: "  <GateRail gates={gates} onAction={onGateAction} />",
        kind: "added",
      },
      {
        id: "wb-4",
        oldLine: 140,
        newLine: 140,
        oldText: "  const unresolvedBlocking = unresolvedThreads.length;",
        newText: "  const unresolvedBlocking = threads.filter((t) => t.status === 'unresolved' && t.severity !== 'p2').length;",
        kind: "modified",
      },
      {
        id: "wb-5",
        oldLine: 141,
        newLine: 141,
        oldText: "  return <ReviewBody />;",
        newText: "  return <ReviewBody />;",
        kind: "context",
      },
    ],
  },
  {
    path: "tina-web/src/components/review/DiffPanel.tsx",
    status: "added",
    additions: 212,
    deletions: 0,
    owner: "agent-ui",
    latestCommitSha: "f21ca03",
    diffRows: [
      {
        id: "dp-1",
        oldLine: null,
        newLine: 1,
        oldText: "",
        newText: "export function DiffPanel({ file, threads }: DiffPanelProps) {",
        kind: "added",
      },
      {
        id: "dp-2",
        oldLine: null,
        newLine: 2,
        oldText: "",
        newText: "  return <CodeDiffFrame file={file} threadAnchors={threads} />;",
        kind: "added",
      },
      {
        id: "dp-3",
        oldLine: null,
        newLine: 3,
        oldText: "",
        newText: "}",
        kind: "added",
      },
      {
        id: "dp-4",
        oldLine: null,
        newLine: 4,
        oldText: "",
        newText: "// TODO: collapse unchanged hunks by default",
        kind: "added",
      },
    ],
  },
  {
    path: "tina-web/src/components/review/ThreadComposer.tsx",
    status: "modified",
    additions: 74,
    deletions: 12,
    owner: "joshua",
    latestCommitSha: "98bc39a",
    diffRows: [
      {
        id: "tc-1",
        oldLine: 58,
        newLine: 58,
        oldText: "const body = draft;",
        newText: "const trimmed = draft.trim();",
        kind: "modified",
      },
      {
        id: "tc-2",
        oldLine: null,
        newLine: 59,
        oldText: "",
        newText: "if (trimmed.length === 0) return setError('Comment cannot be empty');",
        kind: "added",
      },
      {
        id: "tc-3",
        oldLine: 60,
        newLine: 60,
        oldText: "await addThreadCommentMutation({ threadId, body });",
        newText: "await addThreadCommentMutation({ threadId, body: trimmed });",
        kind: "modified",
      },
      {
        id: "tc-4",
        oldLine: null,
        newLine: 61,
        oldText: "",
        newText: "setDraft('');",
        kind: "added",
      },
    ],
  },
  {
    path: "convex/reviewThreads.ts",
    status: "modified",
    additions: 128,
    deletions: 49,
    owner: "agent-platform",
    latestCommitSha: "e91d2a1",
    diffRows: [
      {
        id: "rt-1",
        oldLine: 22,
        newLine: 22,
        oldText: ".index('by_orchestration_status', ['orchestrationId', 'status'])",
        newText: ".index('by_orchestration_status_severity', ['orchestrationId', 'status', 'severity'])",
        kind: "modified",
      },
      {
        id: "rt-2",
        oldLine: 88,
        newLine: null,
        oldText: "export const resolveThread = mutation({ ... })",
        newText: "",
        kind: "removed",
      },
      {
        id: "rt-3",
        oldLine: null,
        newLine: 102,
        oldText: "",
        newText: "export const updateThreadStatus = mutation({ ... })",
        kind: "added",
      },
      {
        id: "rt-4",
        oldLine: null,
        newLine: 103,
        oldText: "",
        newText: "// consolidated mutation enforces state machine transitions",
        kind: "added",
      },
    ],
  },
  {
    path: "tina-data/src/review/client.ts",
    status: "modified",
    additions: 58,
    deletions: 8,
    owner: "agent-platform",
    latestCommitSha: "41dfab8",
    diffRows: [
      {
        id: "cl-1",
        oldLine: 41,
        newLine: 41,
        oldText: "export async function setGateDecision(input: SetGateDecisionInput) {",
        newText: "export async function setGateDecision(input: SetGateDecisionInput) {",
        kind: "context",
      },
      {
        id: "cl-2",
        oldLine: 42,
        newLine: 42,
        oldText: "  return mutation('review:setGateDecision', input);",
        newText: "  return mutation('review:setGateDecision', input);",
        kind: "context",
      },
      {
        id: "cl-3",
        oldLine: null,
        newLine: 45,
        oldText: "",
        newText: "export async function ingestAgentReview(run: AgentReviewRunInput) {",
        kind: "added",
      },
      {
        id: "cl-4",
        oldLine: null,
        newLine: 46,
        oldText: "",
        newText: "  return mutation('review:ingestAgentReview', run);",
        kind: "added",
      },
    ],
  },
  {
    path: "docs/plans/2026-02-13-project4-review-workbench-phase-plan.md",
    status: "modified",
    additions: 33,
    deletions: 5,
    owner: "joshua",
    latestCommitSha: "0e1bf72",
    diffRows: [
      {
        id: "pl-1",
        oldLine: 11,
        newLine: 11,
        oldText: "- [ ] Add PR-style diff + threads shell",
        newText: "- [x] Add PR-style diff + threads shell",
        kind: "modified",
      },
      {
        id: "pl-2",
        oldLine: null,
        newLine: 12,
        oldText: "",
        newText: "- [ ] Wire HITL finalize checkpoint to control plane action log",
        kind: "added",
      },
      {
        id: "pl-3",
        oldLine: null,
        newLine: 13,
        oldText: "",
        newText: "- [ ] Add orchestration-level unresolved summary tile",
        kind: "added",
      },
      {
        id: "pl-4",
        oldLine: 14,
        newLine: null,
        oldText: "- [ ] Define review state transitions",
        newText: "",
        kind: "removed",
      },
    ],
  },
];

export const reviewCommits: ReviewCommit[] = [
  {
    sha: "a8f12d4",
    title: "web: connect gate rail to review shell",
    author: "agent-ui",
    timeAgo: "4m ago",
    status: "passing",
    filesChanged: 4,
  },
  {
    sha: "f21ca03",
    title: "web: add diff panel + anchor rendering",
    author: "agent-ui",
    timeAgo: "12m ago",
    status: "pending",
    filesChanged: 2,
  },
  {
    sha: "e91d2a1",
    title: "convex: consolidate thread status mutation",
    author: "agent-platform",
    timeAgo: "19m ago",
    status: "passing",
    filesChanged: 3,
  },
  {
    sha: "41dfab8",
    title: "data: expose gate + ingestion wrappers",
    author: "agent-platform",
    timeAgo: "24m ago",
    status: "passing",
    filesChanged: 2,
  },
  {
    sha: "98bc39a",
    title: "web: guard empty thread replies",
    author: "joshua",
    timeAgo: "32m ago",
    status: "failing",
    filesChanged: 1,
  },
  {
    sha: "0e1bf72",
    title: "docs: phase plan checkpoints",
    author: "joshua",
    timeAgo: "43m ago",
    status: "passing",
    filesChanged: 1,
  },
];

export const reviewThreadsSeed: ReviewThread[] = [
  {
    id: "thr-311",
    filePath: "tina-web/src/components/review/WorkbenchShell.tsx",
    line: 142,
    summary: "Blocking count ignores superseded findings",
    body: "Unresolved metric includes superseded threads; gate summary can remain blocked after a replacement run. Recompute over latest canonical run id.",
    severity: "p1",
    status: "unresolved",
    source: "agent",
    author: "agent-reviewer",
    updatedAgo: "2m ago",
    commitSha: "a8f12d4",
    gateImpact: "review",
  },
  {
    id: "thr-310",
    filePath: "tina-web/src/components/review/DiffPanel.tsx",
    line: 87,
    summary: "Anchor map loses comments on hunk collapse",
    body: "Collapsed hunks remove in-memory anchors. Preserve anchors in separate map keyed by file + line to prevent hidden unresolved comments.",
    severity: "p0",
    status: "unresolved",
    source: "human",
    author: "joshua",
    updatedAgo: "3m ago",
    commitSha: "f21ca03",
    gateImpact: "finalize",
  },
  {
    id: "thr-309",
    filePath: "convex/reviewThreads.ts",
    line: 233,
    summary: "State transition does not enforce approved -> superseded",
    body: "When a newer commit arrives, approved review states should move to superseded automatically. Mutation currently allows stale approved state.",
    severity: "p1",
    status: "unresolved",
    source: "agent",
    author: "agent-platform",
    updatedAgo: "5m ago",
    commitSha: "e91d2a1",
    gateImpact: "plan",
  },
  {
    id: "thr-308",
    filePath: "tina-data/src/review/client.ts",
    line: 51,
    summary: "Missing typed error branch for gate conflict",
    body: "`setGateDecision` should map conflict errors to a stable `GateConflictError` so UI can show explicit retry instructions.",
    severity: "p2",
    status: "unresolved",
    source: "human",
    author: "qa-lead",
    updatedAgo: "8m ago",
    commitSha: "41dfab8",
    gateImpact: "review",
  },
  {
    id: "thr-307",
    filePath: "tina-web/src/components/review/ThreadComposer.tsx",
    line: 64,
    summary: "Reply mutation should disable while pending",
    body: "Double-submit race still possible when network is slow. Disable compose action until mutation settles.",
    severity: "p2",
    status: "unresolved",
    source: "agent",
    author: "agent-reviewer",
    updatedAgo: "10m ago",
    commitSha: "98bc39a",
    gateImpact: "review",
  },
  {
    id: "thr-306",
    filePath: "docs/plans/2026-02-13-project4-review-workbench-phase-plan.md",
    line: 29,
    summary: "Finalize gate criteria now documented",
    body: "Updated doc includes explicit unresolved-thread threshold and approval ownership. No further action required.",
    severity: "p2",
    status: "resolved",
    source: "human",
    author: "joshua",
    updatedAgo: "14m ago",
    commitSha: "0e1bf72",
    gateImpact: "finalize",
  },
  {
    id: "thr-305",
    filePath: "tina-web/src/components/review/WorkbenchShell.tsx",
    line: 201,
    summary: "Review state machine transitions wired",
    body: "Open -> changes_requested -> approved transitions now map to control action types and are auditable.",
    severity: "p2",
    status: "resolved",
    source: "agent",
    author: "agent-reviewer",
    updatedAgo: "17m ago",
    commitSha: "a8f12d4",
    gateImpact: "plan",
  },
  {
    id: "thr-304",
    filePath: "convex/reviewThreads.ts",
    line: 91,
    summary: "Index covers unresolved-by-gate query",
    body: "Added combined index to support gate rail unresolved counts without full scans.",
    severity: "p2",
    status: "resolved",
    source: "agent",
    author: "agent-platform",
    updatedAgo: "20m ago",
    commitSha: "e91d2a1",
    gateImpact: "review",
  },
  {
    id: "thr-303",
    filePath: "tina-web/src/components/review/DiffPanel.tsx",
    line: 133,
    summary: "File path truncation loses unique tail",
    body: "Long paths truncate from right side. Switch to middle-truncation so duplicate filenames remain disambiguated.",
    severity: "p1",
    status: "unresolved",
    source: "human",
    author: "design-review",
    updatedAgo: "22m ago",
    commitSha: "f21ca03",
    gateImpact: "review",
  },
  {
    id: "thr-302",
    filePath: "tina-data/src/review/client.ts",
    line: 88,
    summary: "Agent run ingestion now idempotent",
    body: "Dedup key on runId+orchestrationId prevents duplicate findings when webhook retries.",
    severity: "p2",
    status: "resolved",
    source: "agent",
    author: "agent-platform",
    updatedAgo: "27m ago",
    commitSha: "41dfab8",
    gateImpact: "plan",
  },
  {
    id: "thr-301",
    filePath: "tina-web/src/components/review/ThreadComposer.tsx",
    line: 41,
    summary: "Whitespace guard added",
    body: "Draft comments are trimmed before submit and rejected when blank.",
    severity: "p2",
    status: "resolved",
    source: "human",
    author: "joshua",
    updatedAgo: "33m ago",
    commitSha: "98bc39a",
    gateImpact: "review",
  },
];

export const agentRuns: AgentReviewRun[] = [
  {
    id: "run-44",
    model: "codex-gpt-5",
    status: "ready",
    findings: 11,
    startedAgo: "6m ago",
    duration: "1m 48s",
    note: "Focused on UI interaction regressions and stale gate transitions.",
  },
  {
    id: "run-43",
    model: "claude-sonnet-4.5",
    status: "ready",
    findings: 9,
    startedAgo: "17m ago",
    duration: "2m 12s",
    note: "Flagged data contract issues in tina-data wrappers.",
  },
  {
    id: "run-42",
    model: "codex-gpt-5",
    status: "failed",
    findings: 0,
    startedAgo: "29m ago",
    duration: "0m 21s",
    note: "Ingestion retry exceeded after malformed line mapping payload.",
  },
];

export const hitlGatesSeed: HitlGate[] = [
  {
    id: "plan",
    label: "Plan checkpoint",
    status: "approved",
    owner: "tech-lead",
    due: "completed",
    summary: "Scope and acceptance criteria signed off.",
  },
  {
    id: "review",
    label: "Review checkpoint",
    status: "blocked",
    owner: "joshua",
    due: "now",
    summary: "Blocking findings remain unresolved in diff + gate rail.",
  },
  {
    id: "finalize",
    label: "Finalize checkpoint",
    status: "pending",
    owner: "release-manager",
    due: "after review",
    summary: "Requires explicit approval after review gate clears.",
  },
];

export const controlActions: ControlAction[] = [
  {
    id: "act-911",
    actor: "joshua",
    action: "setReviewState",
    target: "changes_requested",
    at: "2m ago",
  },
  {
    id: "act-910",
    actor: "agent-reviewer",
    action: "ingestAgentReview",
    target: "run-44",
    at: "6m ago",
  },
  {
    id: "act-909",
    actor: "joshua",
    action: "setGateDecision",
    target: "review:block",
    at: "8m ago",
  },
  {
    id: "act-908",
    actor: "release-manager",
    action: "setGateDecision",
    target: "plan:approve",
    at: "18m ago",
  },
  {
    id: "act-907",
    actor: "agent-platform",
    action: "retryAgentReviewIngestion",
    target: "run-42",
    at: "30m ago",
  },
];
