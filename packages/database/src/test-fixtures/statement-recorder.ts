import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/client";
import { createLazyClient } from "../lazy-client";
import { assertTestDatabaseConnectionAllowed } from "../live-test-guard";

export interface RecordedStatement {
  connectionId: number;
  sql: string;
}

export type RecordedStatementEvent = RecordedStatement & {
  phase: "sent" | "completed";
};

// Record driver calls, including BEGIN and COMMIT, rather than Prisma query logs.
export const createRecordingTenantClient = (connectionString: string) => {
  assertTestDatabaseConnectionAllowed(connectionString);
  const statements: RecordedStatement[] = [];
  const events: RecordedStatementEvent[] = [];
  const pool = new Pool({ connectionString });
  let nextConnectionId = 0;

  pool.on("connect", (connection) => {
    nextConnectionId += 1;
    const connectionId = nextConnectionId;
    connection.query = new Proxy(connection.query, {
      apply: (query, receiver, args: unknown[]) => {
        const [input] = args;
        let sql: unknown;
        if (typeof input === "string") {
          sql = input;
        } else if (input && typeof input === "object") {
          sql = Reflect.get(input, "text");
        }
        if (typeof sql !== "string") {
          throw new Error("Statement recorder requires SQL text");
        }
        const statement = { connectionId, sql };
        statements.push(statement);
        events.push({ ...statement, phase: "sent" });
        const complete = () => {
          events.push({ ...statement, phase: "completed" });
        };

        // Pool.query uses callbacks; interactive transactions use promises.
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
            return result.then(
              (value: unknown) => {
                complete();
                return value;
              },
              (error: unknown) => {
                complete();
                throw error;
              }
            );
          }
          return result;
        } catch (error) {
          complete();
          throw error;
        }
      },
    });
  });

  const client = createLazyClient({
    create: () => new PrismaClient({ adapter: new PrismaPg(pool) }),
    guard: () => assertTestDatabaseConnectionAllowed(connectionString),
  });

  return {
    client,
    disconnect: async () => {
      try {
        await client.$disconnect();
      } finally {
        await pool.end();
      }
    },
    events,
    reset: () => {
      statements.length = 0;
      events.length = 0;
    },
    statements,
  };
};
