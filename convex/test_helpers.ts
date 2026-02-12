import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import { CP_FLAGS } from "./featureFlags";

export type ConvexHarness = ReturnType<typeof convexTest>;

interface CreateNodeOptions {
  name?: string;
  os?: string;
  authTokenHash?: string;
}

interface CreateOrchestrationOptions {
  nodeId: string;
  featureName: string;
  designDocPath?: string;
  branch?: string;
  worktreePath?: string;
  totalPhases?: number;
  currentPhase?: number;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  totalElapsedMins?: number;
}

interface RegisterTeamOptions {
  teamName: string;
  orchestrationId: string;
  leadSessionId?: string;
  tmuxSessionName?: string;
  phaseNumber?: string;
  parentTeamId?: string;
  createdAt?: number;
}

interface CreateProjectOptions {
  name?: string;
  repoPath?: string;
}

export async function createNode(
  t: ConvexHarness,
  options: CreateNodeOptions = {},
) {
  return await t.mutation(api.nodes.registerNode, {
    name: options.name ?? "test-node",
    os: options.os ?? "darwin",
    authTokenHash: options.authTokenHash ?? "abc123",
  });
}

export async function createOrchestration(
  t: ConvexHarness,
  options: CreateOrchestrationOptions,
) {
  const args: Record<string, unknown> = {
    nodeId: options.nodeId as any,
    featureName: options.featureName,
    designDocPath: options.designDocPath ?? "/docs/design.md",
    branch: options.branch ?? `tina/${options.featureName}`,
    totalPhases: options.totalPhases ?? 3,
    currentPhase: options.currentPhase ?? 1,
    status: options.status ?? "planning",
    startedAt: options.startedAt ?? "2026-02-08T10:00:00Z",
  };

  if (options.worktreePath !== undefined) {
    args.worktreePath = options.worktreePath;
  } else if (options.status !== "complete" && options.status !== "blocked") {
    args.worktreePath = `/repo/.worktrees/${options.featureName}`;
  }

  if (options.completedAt !== undefined) {
    args.completedAt = options.completedAt;
  }

  if (options.totalElapsedMins !== undefined) {
    args.totalElapsedMins = options.totalElapsedMins;
  }

  return await t.mutation(api.orchestrations.upsertOrchestration, args as any);
}

export async function createFeatureFixture(
  t: ConvexHarness,
  featureName: string,
) {
  const nodeId = await createNode(t);
  const orchestrationId = await createOrchestration(t, { nodeId, featureName });
  return { nodeId, orchestrationId };
}

export async function registerTeam(
  t: ConvexHarness,
  options: RegisterTeamOptions,
) {
  const args: Record<string, unknown> = {
    teamName: options.teamName,
    orchestrationId: options.orchestrationId,
    leadSessionId: options.leadSessionId ?? "session-abc",
    createdAt: options.createdAt ?? 1707350400000,
  };

  if (options.phaseNumber !== undefined) {
    args.phaseNumber = options.phaseNumber;
  }

  if (options.tmuxSessionName !== undefined) {
    args.tmuxSessionName = options.tmuxSessionName;
  }

  if (options.parentTeamId !== undefined) {
    args.parentTeamId = options.parentTeamId;
  }

  return await t.mutation(api.teams.registerTeam, args as any);
}

export async function createProject(
  t: ConvexHarness,
  options: CreateProjectOptions = {},
) {
  return await t.mutation(api.projects.createProject, {
    name: options.name ?? "TINA",
    repoPath: options.repoPath ?? "/Users/joshua/Projects/tina",
  });
}

interface CreateDesignOptions {
  projectId: string;
  title?: string;
  markdown?: string;
  complexityPreset?: string;
}

export async function createDesign(
  t: ConvexHarness,
  options: CreateDesignOptions,
) {
  const args: Record<string, unknown> = {
    projectId: options.projectId as any,
    title: options.title ?? "Test Design",
    markdown: options.markdown ?? "# Test Design\n\nTest content.",
  };

  if (options.complexityPreset !== undefined) {
    args.complexityPreset = options.complexityPreset;
  }

  return await t.mutation(api.designs.createDesign, args as any);
}

export async function createLaunchFixture(
  t: ConvexHarness,
) {
  const nodeId = await createNode(t);
  const projectId = await createProject(t);
  const designId = await createDesign(t, { projectId });
  return { nodeId, projectId, designId };
}

export async function seedFeatureFlag(
  t: ConvexHarness,
  key: string,
  enabled: boolean,
) {
  return await t.mutation(api.featureFlags.setFlag, { key, enabled });
}

export async function enableAllControlPlaneFlags(t: ConvexHarness) {
  for (const key of Object.values(CP_FLAGS)) {
    await seedFeatureFlag(t, key, true);
  }
}
