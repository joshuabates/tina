// Matches tina-session db types (Serialize derives)

export interface Project {
  id: number;
  name: string;
  repo_path: string;
  created_at: string;
  orchestration_count: number;
}

export interface Orchestration {
  id: string;
  project_id: number;
  feature_name: string;
  design_doc_path: string;
  branch: string;
  worktree_path: string | null;
  total_phases: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_elapsed_mins: number | null;
}

export interface Phase {
  id: number | null;
  orchestration_id: string;
  phase_number: string;
  status: string;
  plan_path: string | null;
  git_range: string | null;
  planning_mins: number | null;
  execution_mins: number | null;
  review_mins: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface TaskEvent {
  id: number | null;
  orchestration_id: string;
  phase_number: string | null;
  task_id: string;
  subject: string;
  description: string | null;
  status: string;
  owner: string | null;
  blocked_by: string | null;
  metadata: string | null;
  recorded_at: string;
}

export interface TeamMember {
  id: number | null;
  orchestration_id: string;
  phase_number: string;
  agent_name: string;
  agent_type: string | null;
  model: string | null;
  joined_at: string | null;
  recorded_at: string;
}

export interface OrchestrationDetail {
  orchestration: Orchestration;
  phases: Phase[];
  tasks: TaskEvent[];
  members: TeamMember[];
}

// WebSocket message from server
export interface WsMessage {
  type: "orchestrations_updated";
  data: Orchestration[];
}
