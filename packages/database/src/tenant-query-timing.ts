import { AsyncLocalStorage } from "node:async_hooks";
import { log } from "@repo/observability/log";

interface QueryTiming {
  database_duration_ms: number;
  statement_count: number;
}

const timings = new AsyncLocalStorage<QueryTiming>();

export const startTenantQuery = (): (() => void) => {
  const timing = timings.getStore();
  if (!timing) {
    return () => undefined;
  }
  timing.statement_count += 1;
  const started = performance.now();
  return () => {
    timing.database_duration_ms += performance.now() - started;
  };
};

// Preview measurement callers wrap a page loader or one Inngest step here.
// Labels describe operations only, never account IDs, SQL or parameters.
export const withTenantQueryTiming = async <T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  if (process.env.TENANT_QUERY_TIMING !== "1") {
    return fn();
  }
  const timing: QueryTiming = {
    database_duration_ms: 0,
    statement_count: 0,
  };
  const started = performance.now();
  return await timings.run(timing, async () => {
    try {
      return await fn();
    } finally {
      try {
        log.info("tenant_query_timing", {
          ...timing,
          operation,
          wall_time_ms: performance.now() - started,
        });
      } catch {
        // Optional measurement must not change the operation's outcome.
      }
    }
  });
};
