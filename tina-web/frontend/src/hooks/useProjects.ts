import { useCallback, useEffect, useState } from "react";
import { fetchProjects } from "../api";
import type { Project } from "../types";

export function useProjects(
  onUpdate?: (listener: () => void) => () => void,
) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchProjects()
      .then((data) => {
        setProjects(data);
      })
      .catch(() => {
        // Silently ignore fetch errors -- will retry on next WS update
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch on WebSocket updates
  useEffect(() => {
    if (!onUpdate) return;
    return onUpdate(load);
  }, [onUpdate, load]);

  return { projects, loading, refresh: load };
}
