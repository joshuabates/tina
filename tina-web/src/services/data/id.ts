import type { Id } from "@convex/_generated/dataModel"
import { NotFoundError } from "../errors"

export function toOrchestrationId(raw: string | undefined): Id<"orchestrations"> {
  if (!raw) throw new NotFoundError({ resource: "orchestration", id: raw ?? "" })
  return raw as Id<"orchestrations">
}

export function toProjectId(raw: string | undefined): Id<"projects"> {
  if (!raw) throw new NotFoundError({ resource: "project", id: raw ?? "" })
  return raw as Id<"projects">
}
