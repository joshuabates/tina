export type DesignStatus = "draft" | "in_review" | "approved" | "archived";
export type TicketStatus = "todo" | "in_progress" | "in_review" | "blocked" | "done";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type MetricCard = {
  label: string;
  value: string;
  note: string;
};

export type DesignRecord = {
  id: string;
  project: string;
  key: string;
  title: string;
  status: DesignStatus;
  owner: string;
  updatedAgo: string;
  orchestrationReady: boolean;
};

export type TicketRecord = {
  id: string;
  project: string;
  key: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  designKey?: string;
  updatedAgo: string;
};

export type CommentRecord = {
  id: string;
  project: string;
  targetType: "design" | "ticket";
  targetKey: string;
  author: string;
  body: string;
  createdAgo: string;
};

export type WorkflowStage = {
  id: "capture" | "shape" | "execute" | "handoff";
  label: string;
  description: string;
  count: string;
};

export const projectOptions = ["all", "tina-core", "tina-web", "tina-session"] as const;

export const metrics: MetricCard[] = [
  { label: "Active designs", value: "12", note: "4 in review" },
  { label: "Open tickets", value: "31", note: "6 blocked" },
  { label: "Untriaged comments", value: "9", note: "2 from agents" },
  { label: "Ready for orchestration", value: "3", note: "designId handoff" },
];

export const designRecords: DesignRecord[] = [
  {
    id: "design-1",
    project: "tina-web",
    key: "TINA-D12",
    title: "Project 1 PM work graph canonicalization",
    status: "in_review",
    owner: "joshua",
    updatedAgo: "5m ago",
    orchestrationReady: true,
  },
  {
    id: "design-2",
    project: "tina-web",
    key: "TINA-D13",
    title: "PM routes and detail editors",
    status: "draft",
    owner: "agent-ui",
    updatedAgo: "18m ago",
    orchestrationReady: false,
  },
  {
    id: "design-3",
    project: "tina-session",
    key: "TINA-D14",
    title: "tina-session work CLI command tree",
    status: "approved",
    owner: "agent-platform",
    updatedAgo: "43m ago",
    orchestrationReady: true,
  },
  {
    id: "design-4",
    project: "tina-core",
    key: "TINA-D15",
    title: "Per-project key allocation contract",
    status: "approved",
    owner: "joshua",
    updatedAgo: "1h ago",
    orchestrationReady: true,
  },
];

export const ticketRecords: TicketRecord[] = [
  {
    id: "ticket-1",
    project: "tina-web",
    key: "TINA-141",
    title: "Add Convex tables for designs and tickets",
    status: "in_progress",
    priority: "urgent",
    designKey: "TINA-D12",
    updatedAgo: "3m ago",
  },
  {
    id: "ticket-2",
    project: "tina-web",
    key: "TINA-142",
    title: "Build PM routes under /pm",
    status: "todo",
    priority: "high",
    designKey: "TINA-D13",
    updatedAgo: "14m ago",
  },
  {
    id: "ticket-3",
    project: "tina-session",
    key: "TINA-143",
    title: "Implement tina-session work design commands",
    status: "in_review",
    priority: "high",
    designKey: "TINA-D14",
    updatedAgo: "11m ago",
  },
  {
    id: "ticket-4",
    project: "tina-core",
    key: "TINA-144",
    title: "Atomic counter mutation for project-scoped keys",
    status: "blocked",
    priority: "urgent",
    designKey: "TINA-D15",
    updatedAgo: "26m ago",
  },
  {
    id: "ticket-5",
    project: "tina-web",
    key: "TINA-145",
    title: "Design detail markdown editor shell",
    status: "todo",
    priority: "medium",
    designKey: "TINA-D13",
    updatedAgo: "39m ago",
  },
];

export const commentFeed: CommentRecord[] = [
  {
    id: "comment-1",
    project: "tina-web",
    targetType: "design",
    targetKey: "TINA-D12",
    author: "joshua",
    body: "Keep this fully compatible with existing AppShell + sidebar conventions.",
    createdAgo: "2m ago",
  },
  {
    id: "comment-2",
    project: "tina-session",
    targetType: "ticket",
    targetKey: "TINA-143",
    author: "agent-platform",
    body: "JSON output contract drafted. Need explicit error envelope examples.",
    createdAgo: "9m ago",
  },
  {
    id: "comment-3",
    project: "tina-core",
    targetType: "ticket",
    targetKey: "TINA-144",
    author: "joshua",
    body: "Blocked on deciding lock strategy for counter allocator.",
    createdAgo: "21m ago",
  },
];

export const workflowStages: WorkflowStage[] = [
  {
    id: "capture",
    label: "Capture",
    description: "New design/ticket creation in Convex",
    count: "8 open",
  },
  {
    id: "shape",
    label: "Shape",
    description: "Edit design markdown and clarify requirements",
    count: "4 active",
  },
  {
    id: "execute",
    label: "Execute",
    description: "Agent + human ticket lifecycle through done",
    count: "31 tickets",
  },
  {
    id: "handoff",
    label: "Handoff",
    description: "Resolve designId and feed /tina:orchestration helper",
    count: "3 ready",
  },
];
