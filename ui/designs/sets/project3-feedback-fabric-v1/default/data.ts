export type TargetType = "task" | "commit";
export type EntryType = "comment" | "suggestion" | "ask_for_change";
export type AuthorType = "human" | "agent";
export type FeedbackStatus = "open" | "resolved";
export type ViewState = "normal" | "loading" | "empty" | "error";

export type FeedbackTarget = {
  id: string;
  targetType: TargetType;
  targetRef: string;
  title: string;
  owner: string;
  state: string;
  updatedAgo: string;
};

export type FeedbackEntry = {
  id: string;
  orchestrationId: string;
  targetType: TargetType;
  targetRef: string;
  entryType: EntryType;
  body: string;
  authorType: AuthorType;
  authorName: string;
  status: FeedbackStatus;
  createdAgo: string;
  updatedAgo: string;
  createdOrder: number;
  resolvedBy?: string;
  resolvedAgo?: string;
};

export const orchestrationContext = {
  orchestrationId: "orch-2403",
  feature: "Feedback Fabric v1",
  phase: "Project 3 UI + Convex APIs",
  owner: "tina-web",
};

export const feedbackTargets: FeedbackTarget[] = [
  {
    id: "task:task-31",
    targetType: "task",
    targetRef: "task-31",
    title: "Add feedbackEntries schema + indexes",
    owner: "agent-platform",
    state: "in_progress",
    updatedAgo: "4m ago",
  },
  {
    id: "task:task-34",
    targetType: "task",
    targetRef: "task-34",
    title: "Build FeedbackSection in TaskQuicklook",
    owner: "agent-ui",
    state: "in_review",
    updatedAgo: "6m ago",
  },
  {
    id: "task:task-36",
    targetType: "task",
    targetRef: "task-36",
    title: "Add RightPanel blocking summary",
    owner: "joshua",
    state: "todo",
    updatedAgo: "11m ago",
  },
  {
    id: "task:task-40",
    targetType: "task",
    targetRef: "task-40",
    title: "Wire tina-data feedback wrappers",
    owner: "agent-platform",
    state: "blocked",
    updatedAgo: "19m ago",
  },
  {
    id: "commit:ad41fe2",
    targetType: "commit",
    targetRef: "ad41fe2",
    title: "convex: add feedbackEntries table",
    owner: "agent-platform",
    state: "pending_review",
    updatedAgo: "3m ago",
  },
  {
    id: "commit:bd22a93",
    targetType: "commit",
    targetRef: "bd22a93",
    title: "web: quicklook feedback composer",
    owner: "agent-ui",
    state: "changes_requested",
    updatedAgo: "8m ago",
  },
  {
    id: "commit:c9f02b4",
    targetType: "commit",
    targetRef: "c9f02b4",
    title: "data: convex client wrappers",
    owner: "agent-platform",
    state: "ready",
    updatedAgo: "14m ago",
  },
];

export const feedbackEntriesSeed: FeedbackEntry[] = [
  {
    id: "fb-109",
    orchestrationId: "orch-2403",
    targetType: "commit",
    targetRef: "bd22a93",
    entryType: "ask_for_change",
    body: "Composer currently allows submit with blank body after trim. Add guard before mutation call.",
    authorType: "human",
    authorName: "joshua",
    status: "open",
    createdAgo: "2m ago",
    updatedAgo: "2m ago",
    createdOrder: 109,
  },
  {
    id: "fb-108",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-34",
    entryType: "suggestion",
    body: "Add filter chips for entryType/status in quicklook so triage does not require opening a full panel.",
    authorType: "agent",
    authorName: "agent-reviewer",
    status: "open",
    createdAgo: "4m ago",
    updatedAgo: "4m ago",
    createdOrder: 108,
  },
  {
    id: "fb-107",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-31",
    entryType: "ask_for_change",
    body: "Document optimistic stale-update behavior for resolve/reopen so UI conflict messaging is deterministic.",
    authorType: "human",
    authorName: "joshua",
    status: "open",
    createdAgo: "6m ago",
    updatedAgo: "6m ago",
    createdOrder: 107,
  },
  {
    id: "fb-106",
    orchestrationId: "orch-2403",
    targetType: "commit",
    targetRef: "ad41fe2",
    entryType: "comment",
    body: "Index naming matches plan doc. Keep `by_target_commit_status_created` for commit-only queries.",
    authorType: "agent",
    authorName: "agent-platform",
    status: "resolved",
    createdAgo: "9m ago",
    updatedAgo: "5m ago",
    createdOrder: 106,
    resolvedBy: "joshua",
    resolvedAgo: "5m ago",
  },
  {
    id: "fb-105",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-40",
    entryType: "ask_for_change",
    body: "Wrapper methods need explicit structured error mapping for invalid enum values and state transition failures.",
    authorType: "human",
    authorName: "joshua",
    status: "open",
    createdAgo: "11m ago",
    updatedAgo: "11m ago",
    createdOrder: 105,
  },
  {
    id: "fb-104",
    orchestrationId: "orch-2403",
    targetType: "commit",
    targetRef: "c9f02b4",
    entryType: "suggestion",
    body: "Return typed wrapper helpers for list-by-target and blocking summary so agent tools can share one fetch path.",
    authorType: "agent",
    authorName: "agent-reviewer",
    status: "open",
    createdAgo: "14m ago",
    updatedAgo: "14m ago",
    createdOrder: 104,
  },
  {
    id: "fb-103",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-36",
    entryType: "comment",
    body: "RightPanel summary should call out open ask_for_change explicitly, not just unresolved total.",
    authorType: "human",
    authorName: "product-review",
    status: "open",
    createdAgo: "16m ago",
    updatedAgo: "16m ago",
    createdOrder: 103,
  },
  {
    id: "fb-102",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-31",
    entryType: "comment",
    body: "Task target validation using deduplicated task events is expensive but acceptable for v1.",
    authorType: "agent",
    authorName: "agent-platform",
    status: "resolved",
    createdAgo: "21m ago",
    updatedAgo: "13m ago",
    createdOrder: 102,
    resolvedBy: "agent-platform",
    resolvedAgo: "13m ago",
  },
  {
    id: "fb-101",
    orchestrationId: "orch-2403",
    targetType: "commit",
    targetRef: "bd22a93",
    entryType: "comment",
    body: "Resolve action should disable when entry already resolved to prevent duplicate state transitions.",
    authorType: "agent",
    authorName: "agent-ui",
    status: "resolved",
    createdAgo: "24m ago",
    updatedAgo: "12m ago",
    createdOrder: 101,
    resolvedBy: "joshua",
    resolvedAgo: "12m ago",
  },
  {
    id: "fb-100",
    orchestrationId: "orch-2403",
    targetType: "commit",
    targetRef: "ad41fe2",
    entryType: "suggestion",
    body: "Surface author type badges in the realtime stream to help separate human escalation from agent notes.",
    authorType: "human",
    authorName: "qa-lead",
    status: "open",
    createdAgo: "27m ago",
    updatedAgo: "27m ago",
    createdOrder: 100,
  },
  {
    id: "fb-099",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-34",
    entryType: "ask_for_change",
    body: "Need explicit keyboard focus behavior after submitting feedback in quicklook.",
    authorType: "human",
    authorName: "ux-review",
    status: "resolved",
    createdAgo: "35m ago",
    updatedAgo: "20m ago",
    createdOrder: 99,
    resolvedBy: "agent-ui",
    resolvedAgo: "20m ago",
  },
  {
    id: "fb-098",
    orchestrationId: "orch-2403",
    targetType: "task",
    targetRef: "task-40",
    entryType: "comment",
    body: "Blocking summary endpoint lines up with RightPanel requirements for Project 3/3.5 handoff.",
    authorType: "agent",
    authorName: "agent-platform",
    status: "open",
    createdAgo: "42m ago",
    updatedAgo: "42m ago",
    createdOrder: 98,
  },
];

export const entryTypeOptions: EntryType[] = ["comment", "suggestion", "ask_for_change"];
export const statusOptions: FeedbackStatus[] = ["open", "resolved"];
export const authorTypeOptions: AuthorType[] = ["human", "agent"];
export const targetTypeOptions: TargetType[] = ["task", "commit"];
export const viewStateOptions: ViewState[] = ["normal", "loading", "empty", "error"];
