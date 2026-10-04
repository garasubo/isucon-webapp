import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "usehooks-ts";

/**
 * Fetches data with `fetcher` and re-fetches it every `intervalMs`.
 * `refresh` triggers an immediate re-fetch (e.g. after a mutation).
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number
): { data: T | undefined; refresh: () => void } {
  const [data, setData] = useState<T>();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const inFlight = useRef(false);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    fetcherRef
      .current()
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(refresh, [refresh]);
  useInterval(refresh, intervalMs);

  return { data, refresh };
}
