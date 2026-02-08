import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Project } from "../types";

export function useProjects() {
  const projects = (useQuery(api.projects.listProjects) ?? []) as Project[];
  return { projects };
}
