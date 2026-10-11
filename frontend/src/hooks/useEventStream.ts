import { useEffect, useState } from "react";
import { errorMessage } from "~/api";

const RETRY_MS = 3000;
const DISCONNECTED = "サーバーとの接続が切れました。再接続しています…";

// EventSource cannot read the body of a failed response, so request it again
// to get the server's message (e.g. 503 when backend/.env is missing).
const describeFailure = async (url: string, signal: AbortSignal) => {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) {
      await response.body?.cancel();
      return DISCONNECTED;
    }
    return `Failed to connect: ${await response.text()}`;
  } catch (e) {
    return errorMessage(e);
  }
};

/**
 * Subscribes to a server-sent event stream whose messages are JSON snapshots.
 * `error` holds the last error (a `server-error` event or a lost connection)
 * until the next snapshot arrives; `data` keeps the last snapshot meanwhile.
 */
export function useEventStream<T>(url: string): {
  data: T | undefined;
  error: string | undefined;
} {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setData(undefined);
    setError(undefined);
    const abort = new AbortController();
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const current = new EventSource(url);
      source = current;
      current.onmessage = (e: MessageEvent<string>) => {
        setData(JSON.parse(e.data));
        setError(undefined);
      };
      current.addEventListener("server-error", (e) =>
        setError((e as MessageEvent<string>).data)
      );
      current.onerror = () => {
        // The browser reconnects by itself after a dropped connection.
        if (current.readyState === EventSource.CONNECTING) {
          setError(DISCONNECTED);
          return;
        }
        // Closed after a non-200 response: the browser gives up, so retry here.
        current.close();
        describeFailure(url, abort.signal).then((message) => {
          if (abort.signal.aborted) return;
          setError(message);
          retryTimer = setTimeout(connect, RETRY_MS);
        });
      };
    };

    connect();
    return () => {
      abort.abort();
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [url]);

  return { data, error };
}
