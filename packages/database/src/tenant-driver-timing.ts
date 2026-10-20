import { AsyncResource } from "node:async_hooks";
import type { PrismaNeon } from "@prisma/adapter-neon";
import type { PrismaPg } from "@prisma/adapter-pg";
import { startTenantQuery } from "./tenant-query-timing";

const instrumentConnection = (connection: { query: object }): void => {
  if (typeof connection.query !== "function") {
    throw new Error("Tenant query timing requires a queryable connection");
  }
  connection.query = new Proxy(connection.query, {
    apply: (query, receiver, args: unknown[]) => {
      const complete = startTenantQuery();
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = (...callbackArgs: unknown[]) => {
          complete();
          return Reflect.apply(callback, undefined, callbackArgs);
        };
      }
      try {
        const result: unknown = Reflect.apply(query, receiver, args);
        if (result instanceof Promise) {
          return result.finally(complete);
        }
        return result;
      } catch (error) {
        complete();
        throw error;
      }
    },
  });
};

// Attach before the adapter's pool opens any connection. Prisma query events
// omit driver BEGIN calls, so count the driver operations themselves.
export const instrumentTenantAdapter = <T extends PrismaPg | PrismaNeon>(
  adapter: T
): T =>
  new Proxy(adapter, {
    get: (target, property) => {
      if (property === "connect") {
        return async () => {
          const connected = await target.connect();
          const pool = connected.underlyingDriver();
          // Queued Pool.query work can be dispatched by the previous request's
          // release callback. Restore the submitting scope before client.query.
          pool.connect = new Proxy(pool.connect, {
            apply: (connect, receiver, args: unknown[]) => {
              const callback = args.at(-1);
              if (typeof callback === "function") {
                args[args.length - 1] = AsyncResource.bind(
                  (...callbackArgs: unknown[]) =>
                    Reflect.apply(callback, undefined, callbackArgs)
                );
              }
              return Reflect.apply(connect, receiver, args);
            },
          });
          pool.on("connect", instrumentConnection);
          return connected;
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
