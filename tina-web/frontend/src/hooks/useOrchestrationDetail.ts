import { useCallback, useEffect, useState } from "react";
import { fetchOrchestrationDetail } from "../api";
import type { OrchestrationDetail } from "../types";

export function useOrchestrationDetail(
  id: string,
  onUpdate?: (listener: () => void) => () => void,
) {
  const [detail, setDetail] = useState<OrchestrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchOrchestrationDetail(id)
      .then((data) => {
        setDetail(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Re-fetch on WebSocket updates
  useEffect(() => {
    if (!onUpdate) return;
    return onUpdate(load);
  }, [onUpdate, load]);

  return { detail, loading, error };
}
