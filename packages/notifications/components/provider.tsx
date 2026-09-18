"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NotificationSseEvent } from "../src/sse/broker";

type NotificationListener = (event: NotificationSseEvent) => void;

interface NotificationsContextValue {
  connectionVersion: number;
  status: "closed" | "connecting" | "open";
  subscribe: (listener: NotificationListener) => () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  connectionVersion: 0,
  status: "closed",
  subscribe: () => () => undefined,
});

interface NotificationsProviderProps {
  children: ReactNode;
  streamUrl: string | null;
}

export const NotificationsProvider = ({
  children,
  streamUrl,
}: NotificationsProviderProps) => {
  const listeners = useRef(new Set<NotificationListener>());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const [status, setStatus] =
    useState<NotificationsContextValue["status"]>("closed");
  const [connectionVersion, setConnectionVersion] = useState(0);

  const subscribe = useCallback((listener: NotificationListener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  useEffect(() => {
    if (!streamUrl) {
      setStatus("closed");
      return;
    }

    let eventSource: EventSource | null = null;
    let cancelled = false;

    const close = () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      eventSource?.close();
      eventSource = null;
    };

    const connect = () => {
      if (cancelled) {
        return;
      }
      setStatus("connecting");
      eventSource = new EventSource(streamUrl, { withCredentials: true });
      eventSource.onopen = () => {
        retryCount.current = 0;
        setStatus("open");
        setConnectionVersion((version) => version + 1);
      };
      eventSource.onerror = () => {
        eventSource?.close();
        setStatus("connecting");
        const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
        retryCount.current += 1;
        retryTimer.current = setTimeout(connect, delay);
      };

      for (const eventType of [
        "notification.created",
        "notification.read",
        "notification.all_read",
        "sync.run_status_changed",
      ] as const) {
        eventSource.addEventListener(eventType, (message) => {
          const parsed = parseEvent(eventType, message);
          if (!parsed) {
            return;
          }
          for (const listener of listeners.current) {
            listener(parsed);
          }
        });
      }
    };

    connect();
    return () => {
      cancelled = true;
      close();
      setStatus("closed");
    };
  }, [streamUrl]);

  const value = useMemo(
    () => ({ connectionVersion, status, subscribe }),
    [connectionVersion, status, subscribe]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export function useNotificationEvents(): NotificationsContextValue {
  return useContext(NotificationsContext);
}

function parseEvent(
  type: NotificationSseEvent["type"],
  message: MessageEvent
): NotificationSseEvent | null {
  try {
    const payload = JSON.parse(String(message.data));
    if (type === "notification.created") {
      return { payload, type };
    }
    if (type === "notification.read") {
      return { payload, type };
    }
    return { payload, type };
  } catch {
    return null;
  }
}
