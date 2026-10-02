import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "../generated/client";

type WriteGuard = (transaction: Prisma.TransactionClient) => Promise<void>;
interface GuardLifecycle {
  active: boolean;
  pending: Set<Promise<unknown>>;
}
interface GuardContext {
  guard: WriteGuard;
  lifecycle: GuardLifecycle;
  transaction?: Prisma.TransactionClient;
}
const contexts = new AsyncLocalStorage<GuardContext>();
const reads = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "fields",
]);

/** The caller supplies domain authority; the database package knows no provider. */
export async function withDatabaseWriteGuard<T>(
  guard: WriteGuard,
  operation: () => Promise<T>
) {
  if (contexts.getStore()) {
    throw new Error(
      "Database write authority cannot be replaced inside an invocation"
    );
  }
  const context: GuardContext = {
    guard,
    lifecycle: { active: true, pending: new Set() },
  };
  let result: T;
  let unfinished: Promise<unknown>[] = [];
  try {
    result = await contexts.run(context, operation);
  } finally {
    context.lifecycle.active = false;
    // Detached writes cannot outlive the invocation: their final check rolls
    // back, and the caller does not resume before every started transaction closes.
    unfinished = [...context.lifecycle.pending];
    await Promise.allSettled(unfinished);
  }
  if (unfinished.length > 0) {
    throw new Error("Database invocation left unawaited guarded transactions");
  }
  return result;
}

function assertActive(context: GuardContext | undefined) {
  if (context && !context.lifecycle.active) {
    throw new Error("Database write authority invocation has closed");
  }
}

function deferred<T>(operation: () => Promise<T>): Promise<T> {
  let pending: Promise<T> | undefined;
  const run = () => {
    pending ??= Promise.resolve().then(operation);
    return pending;
  };
  return {
    [Symbol.toStringTag]: "PrismaPromise",
    catch: (rejected) => run().catch(rejected),
    finally: (settled) => run().finally(settled),
    // biome-ignore lint/suspicious/noThenProperty: Deliberate lazy promise prevents rejected array transactions from starting writes.
    then: (fulfilled, rejected) => run().then(fulfilled, rejected),
  };
}

function method(
  receiver: object,
  property: PropertyKey,
  args: unknown[]
): unknown {
  const callable: unknown = Reflect.get(receiver, property);
  if (typeof callable !== "function") {
    throw new Error("Database operation is unavailable");
  }
  return Reflect.apply(callable, receiver, args);
}
function delegate(client: object, property: PropertyKey): object {
  const value: unknown = Reflect.get(client, property);
  if (!value || typeof value !== "object") {
    throw new Error("Database delegate is unavailable");
  }
  return value;
}

function guardedTransaction(
  client: object,
  context: GuardContext,
  operation: (transaction: Prisma.TransactionClient) => Promise<unknown>,
  options?: unknown
): Promise<unknown> {
  assertActive(context);
  const pending = Promise.resolve().then(() => {
    assertActive(context);
    return method(client, "$transaction", [
      async (value: unknown) => {
        assertActive(context);
        if (!value || typeof value !== "object") {
          throw new Error("Database transaction is unavailable");
        }
        // Prisma supplies the transaction client; reflection preserves its generic overloads.
        const transaction = value as Prisma.TransactionClient;
        await context.guard(transaction);
        assertActive(context);
        const result = await contexts.run({ ...context, transaction }, () =>
          operation(transaction)
        );
        assertActive(context);
        await context.guard(transaction);
        assertActive(context);
        return result;
      },
      options,
    ]);
  });
  context.lifecycle.pending.add(pending);
  const settled = () => context.lifecycle.pending.delete(pending);
  // Attach rejection handling immediately, including for a detached invocation.
  pending.then(settled, settled);
  return pending;
}

/** Cached delegates still resolve authority at invocation, never at property access. */
export function createWriteGuardedClient<Client extends object>(
  client: Client
): Client {
  return guardedClient(client);
}

function guardedClient<Client extends object>(
  client: Client,
  inheritedContext?: GuardContext
): Client {
  const ordinaryDelegates = new Map<PropertyKey, object>();
  const scopedDelegates = new WeakMap<GuardContext, Map<PropertyKey, object>>();
  // The proxy preserves Prisma's overloaded client interface; runtime operations are checked below.
  return new Proxy(client, {
    get: (_target, property) => {
      const captured = contexts.getStore() ?? inheritedContext;
      assertActive(captured);
      const value: unknown = Reflect.get(client, property);
      if (typeof value === "function") {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep transaction and raw-operation admission in one auditable branch.
        return (...args: unknown[]) => {
          const context = contexts.getStore() ?? captured;
          assertActive(context);
          if (!context) {
            return method(client, property, args);
          }
          if (property === "$transaction") {
            if (context.transaction || typeof args[0] !== "function") {
              throw new Error(
                "Guarded database requires a non-nested interactive transaction"
              );
            }
            const [callback] = args;
            return guardedTransaction(
              client,
              context,
              async (transaction) => {
                const wrapped = guardedClient(transaction, contexts.getStore());
                return await Reflect.apply(callback, undefined, [wrapped]);
              },
              args[1]
            );
          }
          if (
            ![
              "$queryRaw",
              "$queryRawUnsafe",
              "$executeRaw",
              "$executeRawUnsafe",
            ].includes(String(property))
          ) {
            throw new Error(
              "Database control operations are unavailable inside guarded work"
            );
          }
          if (context.transaction) {
            return method(context.transaction, property, args);
          }
          return deferred(() =>
            guardedTransaction(
              client,
              context,
              async (transaction) => await method(transaction, property, args)
            )
          );
        };
      }
      if (
        !value ||
        typeof value !== "object" ||
        typeof property !== "string" ||
        property.startsWith("_")
      ) {
        if (captured) {
          throw new Error(
            "Database internals are unavailable inside guarded work"
          );
        }
        return value;
      }
      let delegates = captured
        ? scopedDelegates.get(captured)
        : ordinaryDelegates;
      if (!delegates) {
        delegates = new Map();
        if (captured) {
          scopedDelegates.set(captured, delegates);
        }
      }
      let wrapped = delegates.get(property);
      if (!wrapped) {
        wrapped = new Proxy(
          {},
          {
            get: (_delegate, operation) => {
              const delegateContext = contexts.getStore() ?? captured;
              assertActive(delegateContext);
              const original = delegate(client, property);
              const member: unknown = Reflect.get(original, operation);
              if (typeof member !== "function") {
                if (delegateContext) {
                  throw new Error(
                    "Database delegate internals are unavailable inside guarded work"
                  );
                }
                return member;
              }
              return (...args: unknown[]) => {
                const context = contexts.getStore() ?? delegateContext;
                assertActive(context);
                const receiver = delegate(
                  context?.transaction ?? client,
                  property
                );
                if (
                  !context ||
                  context.transaction ||
                  reads.has(String(operation))
                ) {
                  return method(receiver, operation, args);
                }
                return deferred(() =>
                  guardedTransaction(
                    client,
                    context,
                    async (transaction) =>
                      await method(
                        delegate(transaction, property),
                        operation,
                        args
                      )
                  )
                );
              };
            },
          }
        );
        delegates.set(property, wrapped);
      }
      return wrapped;
    },
  });
}
