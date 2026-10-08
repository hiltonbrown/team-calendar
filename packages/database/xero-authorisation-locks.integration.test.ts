import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withXeroGrantLock } from "./src/xero-locks";

function barrier() {
  let release: () => void = () => {
    throw new Error("Barrier has not been initialized");
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function lock(app: string, user: string, work: () => Promise<void>) {
  return withXeroGrantLock(
    {
      deadlineAt: Date.now() + 5000,
      mode: "refresh",
      providerAppId: app,
      xeroUserId: user,
    },
    work
  );
}
async function staysBlocked(promise: Promise<unknown>) {
  const result = await Promise.race([
    promise.then(() => "entered"),
    new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100)),
  ]);
  expect(result).toBe("blocked");
}
describe("canonical PostgreSQL authorisation locks", () => {
  it("serializes refresh for the same verified app and user", async () => {
    const app = randomUUID(),
      entered = barrier(),
      release = barrier();
    const first = lock(app, "user", async () => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    const nextEntered = barrier();
    const second = lock(app, "user", () => {
      nextEntered.release();
      return Promise.resolve();
    });
    try {
      await staysBlocked(nextEntered.promise);
    } finally {
      release.release();
    }
    await Promise.all([first, second]);
    await nextEntered.promise;
  });
  it("lets independent verified users refresh concurrently", async () => {
    const app = randomUUID(),
      entered = barrier(),
      release = barrier();
    const first = lock(app, "user-one", async () => {
      entered.release();
      await release.promise;
    });
    await entered.promise;
    try {
      await lock(app, "user-two", () => Promise.resolve());
    } finally {
      release.release();
    }
    await first;
  });
  it("keeps code exchange exclusive with refresh and releases after rollback", async () => {
    const app = randomUUID(),
      entered = barrier(),
      release = barrier();
    const failed = withXeroGrantLock(
      { deadlineAt: Date.now() + 5000, mode: "code", providerAppId: app },
      async () => {
        entered.release();
        await release.promise;
        throw new Error("rollback");
      }
    ).catch((error) => {
      expect(error.message).toBe("rollback");
    });
    await entered.promise;
    const nextEntered = barrier();
    const refresh = lock(app, "user", () => {
      nextEntered.release();
      return Promise.resolve();
    });
    try {
      await staysBlocked(nextEntered.promise);
    } finally {
      release.release();
    }
    await Promise.all([failed, refresh]);
    await nextEntered.promise;
  });
});
