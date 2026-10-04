import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "usehooks-ts";
import { errorMessage } from "~/api";

/**
 * Fetches data with `fetcher` and re-fetches it every `intervalMs`.
 * `refresh` triggers an immediate re-fetch (e.g. after a mutation).
 * `error` holds the message of the last failed fetch until one succeeds;
 * `data` keeps the last successful result meanwhile.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number
): { data: T | undefined; error: string | undefined; refresh: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const inFlight = useRef(false);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    fetcherRef
      .current()
      .then((result) => {
        setData(result);
        setError(undefined);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  useEffect(refresh, [refresh]);
  useInterval(refresh, intervalMs);

  return { data, error, refresh };
}
