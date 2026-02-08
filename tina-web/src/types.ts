import type { Id } from "@convex/_generated/dataModel";

export interface Project {
  _id: Id<"projects">;
  _creationTime: number;
  name: string;
  repoPath: string;
  createdAt: string;
  orchestrationCount: number;
  latestFeature: string | null;
  latestStatus: string | null;
}

export interface Orchestration {
  _id: Id<"orchestrations">;
  _creationTime: number;
  nodeId: Id<"nodes">;
  projectId?: Id<"projects">;
  featureName: string;
  designDocPath: string;
  branch: string;
  worktreePath?: string;
  totalPhases: number;
  currentPhase: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  totalElapsedMins?: number;
  nodeName: string;
}

export interface Phase {
  _id: Id<"phases">;
  _creationTime: number;
  orchestrationId: Id<"orchestrations">;
  phaseNumber: string;
  status: string;
  planPath?: string;
  gitRange?: string;
  planningMins?: number;
  executionMins?: number;
  reviewMins?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskEvent {
  _id: Id<"taskEvents">;
  _creationTime: number;
  orchestrationId: Id<"orchestrations">;
  phaseNumber?: string;
  taskId: string;
  subject: string;
  description?: string;
  status: string;
  owner?: string;
  blockedBy?: string;
  metadata?: string;
  recordedAt: string;
}

export interface TeamMember {
  _id: Id<"teamMembers">;
  _creationTime: number;
  orchestrationId: Id<"orchestrations">;
  phaseNumber: string;
  agentName: string;
  agentType?: string;
  model?: string;
  joinedAt?: string;
  recordedAt: string;
}

export interface OrchestrationEvent {
  _id: Id<"orchestrationEvents">;
  _creationTime: number;
  orchestrationId: Id<"orchestrations">;
  phaseNumber?: string;
  eventType: string;
  source: string;
  summary: string;
  detail?: string;
  recordedAt: string;
}

export interface OrchestrationDetail {
  _id: Id<"orchestrations">;
  _creationTime: number;
  nodeId: Id<"nodes">;
  featureName: string;
  designDocPath: string;
  branch: string;
  worktreePath?: string;
  totalPhases: number;
  currentPhase: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  totalElapsedMins?: number;
  nodeName: string;
  phases: Phase[];
  tasks: TaskEvent[];
  teamMembers: TeamMember[];
}
