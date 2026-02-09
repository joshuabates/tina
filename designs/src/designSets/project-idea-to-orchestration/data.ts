export type StageId = "quick-idea" | "brainstorm" | "design-plan" | "orchestration";
export type ItemType = "idea" | "bug" | "story" | "design";
export type Priority = "low" | "medium" | "high" | "critical";
export type ColumnId = "intake" | "brainstorm" | "plan" | "ready";

export type StageStep = {
  id: StageId;
  label: string;
  goal: string;
};

export type MetricCard = {
  label: string;
  value: string;
  detail: string;
};

export type AlertItem = {
  id: string;
  severity: "warning" | "risk" | "info";
  message: string;
  action: string;
};

export type BoardColumn = {
  id: ColumnId;
  label: string;
  hint: string;
  wipLimit: number;
};

export type BoardItem = {
  id: string;
  title: string;
  type: ItemType;
  owner: string;
  priority: Priority;
  estimate: string;
  column: ColumnId;
  notes: number;
  blockedReason?: string;
};

export type BrainstormCluster = {
  id: string;
  title: string;
  hypothesis: string;
  linkedItemIds: string[];
  openQuestions: string[];
};

export type PlanSection = {
  id: string;
  title: string;
  status: "draft" | "review" | "approved";
  owner: string;
  updatedAgo: string;
  linkedItemIds: string[];
  decisionsOpen: number;
};

export type LaunchPreset = {
  id: string;
  name: string;
  description: string;
  taskModel: "haiku-4.1" | "sonnet-4.5" | "opus-4.1";
  reviewModel: "sonnet-4.5" | "opus-4.1";
  parallelism: number;
  requiresHumanReview: boolean;
  riskMode: "safe" | "balanced" | "fast";
};

export type LaunchChecklistItem = {
  id: string;
  label: string;
  state: "done" | "pending" | "blocked";
};

export const stageSteps: StageStep[] = [
  {
    id: "quick-idea",
    label: "Quick idea",
    goal: "Capture signal in under one minute.",
  },
  {
    id: "brainstorm",
    label: "Brainstorm",
    goal: "Group related ideas and define hypotheses.",
  },
  {
    id: "design-plan",
    label: "Design plan",
    goal: "Lock sequencing, acceptance checks, and ownership.",
  },
  {
    id: "orchestration",
    label: "Orchestration",
    goal: "Configure runtime and launch from approved plan.",
  },
];

export const metrics: MetricCard[] = [
  { label: "Untriaged ideas", value: "11", detail: "5 from today" },
  { label: "Blocked bugs", value: "3", detail: "2 waiting on design decisions" },
  { label: "Plans ready to launch", value: "4", detail: "1 approved in last hour" },
  { label: "Active orchestrations", value: "7", detail: "2 in review phase" },
];

export const alerts: AlertItem[] = [
  {
    id: "alert-1",
    severity: "risk",
    message: "Two critical bugs remain in brainstorm with no owner assigned.",
    action: "Assign owners",
  },
  {
    id: "alert-2",
    severity: "warning",
    message: "Design plan section 'Fallback path' is still draft.",
    action: "Open section",
  },
  {
    id: "alert-3",
    severity: "info",
    message: "Launch preset switched to balanced mode after last incident review.",
    action: "View change",
  },
];

export const boardColumns: BoardColumn[] = [
  {
    id: "intake",
    label: "Intake",
    hint: "Quick captures and raw issues.",
    wipLimit: 8,
  },
  {
    id: "brainstorm",
    label: "Brainstorming",
    hint: "Group and challenge assumptions.",
    wipLimit: 6,
  },
  {
    id: "plan",
    label: "Design plan drafting",
    hint: "Convert into structured implementation plan.",
    wipLimit: 5,
  },
  {
    id: "ready",
    label: "Ready to orchestrate",
    hint: "Plan approved, waiting launch window.",
    wipLimit: 4,
  },
];

export const boardItems: BoardItem[] = [
  {
    id: "I-101",
    title: "Idea: lighter kickoff checklist for first-time contributors",
    type: "idea",
    owner: "Nia",
    priority: "medium",
    estimate: "30m",
    column: "intake",
    notes: 2,
  },
  {
    id: "B-044",
    title: "Bug: orchestration status card misses stale warning after reconnect",
    type: "bug",
    owner: "Eli",
    priority: "critical",
    estimate: "45m",
    column: "intake",
    notes: 4,
  },
  {
    id: "S-219",
    title: "Story: keyboard-only plan section reordering",
    type: "story",
    owner: "Rae",
    priority: "high",
    estimate: "60m",
    column: "brainstorm",
    notes: 3,
  },
  {
    id: "D-032",
    title: "Design: review artifact timeline for mixed human+agent feedback",
    type: "design",
    owner: "Mina",
    priority: "high",
    estimate: "90m",
    column: "brainstorm",
    notes: 5,
  },
  {
    id: "B-047",
    title: "Bug: plan comments lose source line when markdown refreshes",
    type: "bug",
    owner: "Ivo",
    priority: "high",
    estimate: "35m",
    column: "brainstorm",
    notes: 2,
    blockedReason: "Need stable line-id approach from design plan section 2.",
  },
  {
    id: "S-230",
    title: "Story: reuse approved plan templates for repeatable launches",
    type: "story",
    owner: "Nia",
    priority: "medium",
    estimate: "50m",
    column: "plan",
    notes: 1,
  },
  {
    id: "D-039",
    title: "Design: orchestration start modal with risk profile presets",
    type: "design",
    owner: "Rae",
    priority: "high",
    estimate: "40m",
    column: "plan",
    notes: 6,
  },
  {
    id: "S-233",
    title: "Story: branch naming guardrail before orchestration kickoff",
    type: "story",
    owner: "Mina",
    priority: "medium",
    estimate: "25m",
    column: "ready",
    notes: 0,
  },
  {
    id: "D-041",
    title: "Design: starter phase map generated from approved plan sections",
    type: "design",
    owner: "Eli",
    priority: "high",
    estimate: "55m",
    column: "ready",
    notes: 2,
  },
];

export const brainstormClusters: BrainstormCluster[] = [
  {
    id: "cluster-1",
    title: "Reduce setup friction",
    hypothesis: "Most drop-off is caused by unclear initial ownership and next action.",
    linkedItemIds: ["I-101", "S-219"],
    openQuestions: ["Should onboarding bugs auto-create a design-note card?"],
  },
  {
    id: "cluster-2",
    title: "Plan comment reliability",
    hypothesis: "Line-level mapping needs stable anchors before orchestration can trust comments.",
    linkedItemIds: ["B-047", "D-032"],
    openQuestions: ["Can we persist section hash + line delta without manual repair?"],
  },
  {
    id: "cluster-3",
    title: "Safer launch defaults",
    hypothesis: "Preset-driven launch reduces operator mistakes under time pressure.",
    linkedItemIds: ["D-039", "D-041", "S-233"],
    openQuestions: ["Should critical-bug cards force safe mode automatically?"],
  },
];

export const planSections: PlanSection[] = [
  {
    id: "section-1",
    title: "Problem framing and success metrics",
    status: "approved",
    owner: "Mina",
    updatedAgo: "12m ago",
    linkedItemIds: ["I-101", "B-044"],
    decisionsOpen: 0,
  },
  {
    id: "section-2",
    title: "Execution slices and task ownership",
    status: "review",
    owner: "Rae",
    updatedAgo: "6m ago",
    linkedItemIds: ["S-219", "D-032", "B-047"],
    decisionsOpen: 2,
  },
  {
    id: "section-3",
    title: "Fallback and rollback strategy",
    status: "draft",
    owner: "Eli",
    updatedAgo: "3m ago",
    linkedItemIds: ["D-039"],
    decisionsOpen: 3,
  },
  {
    id: "section-4",
    title: "Launch gates and review policy",
    status: "approved",
    owner: "Nia",
    updatedAgo: "1m ago",
    linkedItemIds: ["D-041", "S-233"],
    decisionsOpen: 0,
  },
];

export const launchPresets: LaunchPreset[] = [
  {
    id: "preset-safe",
    name: "Safe rollout",
    description: "Lower parallelism, required human review, conservative model mix.",
    taskModel: "sonnet-4.5",
    reviewModel: "opus-4.1",
    parallelism: 2,
    requiresHumanReview: true,
    riskMode: "safe",
  },
  {
    id: "preset-balanced",
    name: "Balanced delivery",
    description: "Moderate speed with human review optional.",
    taskModel: "sonnet-4.5",
    reviewModel: "sonnet-4.5",
    parallelism: 3,
    requiresHumanReview: false,
    riskMode: "balanced",
  },
  {
    id: "preset-fast",
    name: "Fast iteration",
    description: "Higher parallelism and lighter review gates for low-risk work.",
    taskModel: "haiku-4.1",
    reviewModel: "sonnet-4.5",
    parallelism: 5,
    requiresHumanReview: false,
    riskMode: "fast",
  },
];

export const launchChecklist: LaunchChecklistItem[] = [
  { id: "lc-1", label: "At least one approved design-plan section", state: "done" },
  { id: "lc-2", label: "No critical bugs in intake or brainstorm", state: "blocked" },
  { id: "lc-3", label: "Ownership assigned for every phase task", state: "pending" },
  { id: "lc-4", label: "Rollback thresholds documented", state: "pending" },
];
