import type { Orchestration, OrchestrationDetail, Project, TaskEvent } from "./types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function fetchProjects(): Promise<Project[]> {
  return fetchJson("/api/projects");
}

export function fetchProjectOrchestrations(projectId: number): Promise<Orchestration[]> {
  return fetchJson(`/api/projects/${projectId}/orchestrations`);
}

export function fetchOrchestrations(): Promise<Orchestration[]> {
  return fetchJson("/api/orchestrations");
}

export function fetchOrchestrationDetail(id: string): Promise<OrchestrationDetail> {
  return fetchJson(`/api/orchestrations/${encodeURIComponent(id)}`);
}

export function fetchTaskEvents(orchestrationId: string, taskId: string): Promise<TaskEvent[]> {
  return fetchJson(
    `/api/orchestrations/${encodeURIComponent(orchestrationId)}/tasks/${encodeURIComponent(taskId)}/events`,
  );
}

export async function createProject(name: string, repoPath: string): Promise<Project> {
  return fetchJson("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, repo_path: repoPath }),
  });
}

export async function renameProject(id: number, name: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}
