// Matches tina-data/src/discovery.rs::OrchestrationStatus
// Tagged enum serialization (serde rename_all = "snake_case")
export type OrchestrationStatus =
  | { executing: { phase: number } }
  | { blocked: { phase: number; reason: string } }
  | "complete"
  | "idle";

// Matches tina-session Task (serde rename)
export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm: string | null;
  status: "pending" | "in_progress" | "completed";
  owner: string | null;
  blocks: string[];
  blockedBy: string[];
  metadata: unknown;
}

// Matches tina-session Agent (serde rename)
export interface Agent {
  agentId: string;
  name: string;
  agentType: string | null;
  model: string;
  joinedAt: number;
  tmuxPaneId: string | null;
  cwd: string;
  subscriptions: string[];
}

// Matches tina-data/src/discovery.rs::Orchestration
export interface Orchestration {
  team_name: string;
  title: string;
  feature_name: string;
  cwd: string;
  current_phase: number;
  total_phases: number;
  design_doc_path: string;
  context_percent: number | null;
  status: OrchestrationStatus;
  orchestrator_tasks: Task[];
  tasks: Task[];
  members: Agent[];
}

// Matches tina-data/src/tasks.rs::TaskSummary
export interface TaskSummary {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  blocked: number;
}

// WebSocket message from server
export interface WsMessage {
  type: "orchestrations_updated";
  data: Orchestration[];
}
