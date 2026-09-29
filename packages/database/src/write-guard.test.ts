import { describe, expect, it, vi } from "vitest";
import {
  createWriteGuardedClient,
  withDatabaseWriteGuard,
} from "./write-guard";

function barrier() {
  let release: () => void = () => {
    throw new Error("Barrier is not initialised");
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: () => release() };
}

function fixture() {
  const rows: string[] = [];
  const tx = {
    $executeRawUnsafe: vi.fn(async () => 1),
    item: {
      create: vi.fn((value: string) => {
        rows.push(value);
        return Promise.resolve(value);
      }),
      findMany: vi.fn(async () => [...rows]),
    },
  };
  const base = {
    $disconnect: vi.fn(),
    $executeRawUnsafe: vi.fn(async () => 1),
    $transaction: vi.fn(
      async (operation: (client: typeof tx) => Promise<unknown>) => {
        const before = [...rows];
        try {
          return await operation(tx);
        } catch (error) {
          rows.splice(0, rows.length, ...before);
          throw error;
        }
      }
    ),
    item: {
      create: vi.fn((value: string) => {
        rows.push(value);
        return Promise.resolve(value);
      }),
      findMany: vi.fn(async () => [...rows]),
    },
  };
  return { base, client: createWriteGuardedClient(base), rows, tx };
}

describe("invocation database write guard", () => {
  it("preserves ordinary delegates and transactions without admission", async () => {
    const { base, client } = fixture();
    expect(client.item).toBe(client.item);
    await client.item.create("ordinary");
    expect(base.item.create).toHaveBeenCalledOnce();
    expect(base.$transaction).not.toHaveBeenCalled();
  });

  it("checks authority before writes captured before the invocation", async () => {
    const { base, client, tx } = fixture();
    const { create } = client.item;
    const guard = vi.fn(() => Promise.reject(new Error("revoked")));
    await expect(
      withDatabaseWriteGuard(guard, () => create("blocked"))
    ).rejects.toThrow("revoked");
    expect(base.item.create).not.toHaveBeenCalled();
    expect(tx.item.create).not.toHaveBeenCalled();
  });

  it("rolls back a direct write when final authority is lost", async () => {
    const { client, rows, tx } = fixture();
    const guard = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("expired"));
    await expect(
      withDatabaseWriteGuard(guard, () => client.item.create("rolled back"))
    ).rejects.toThrow("expired");
    expect(tx.item.create).toHaveBeenCalledOnce();
    expect(rows).toEqual([]);
  });

  it("routes global and passed-client writes to the same interactive transaction", async () => {
    const { base, client, rows, tx } = fixture();
    const guard = vi.fn(async () => undefined);
    await withDatabaseWriteGuard(guard, () =>
      client.$transaction(async (transaction) => {
        await transaction.item.create("first");
        await client.item.create("second");
        expect(await client.item.findMany()).toEqual(["first", "second"]);
      })
    );
    expect(rows).toEqual(["first", "second"]);
    expect(base.$transaction).toHaveBeenCalledOnce();
    expect(base.item.create).not.toHaveBeenCalled();
    expect(tx.item.create).toHaveBeenCalledTimes(2);
    expect(guard).toHaveBeenCalledTimes(2);
  });

  it("checks raw SQL because a query can also mutate", async () => {
    const { client, tx } = fixture();
    const guard = vi.fn(() => Promise.reject(new Error("revoked")));
    await expect(
      withDatabaseWriteGuard(guard, () => client.$executeRawUnsafe())
    ).rejects.toThrow("revoked");
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("does not allow connection controls from guarded work", async () => {
    const { base, client } = fixture();
    await expect(
      withDatabaseWriteGuard(
        async () => undefined,
        async () => client.$disconnect()
      )
    ).rejects.toThrow("control operations");
    expect(base.$disconnect).not.toHaveBeenCalled();
  });

  it("rejects nested transactions before opening another transaction", async () => {
    const { base, client } = fixture();
    await expect(
      withDatabaseWriteGuard(
        async () => undefined,
        () =>
          client.$transaction(async () =>
            client.$transaction(async () => undefined)
          )
      )
    ).rejects.toThrow("non-nested");
    expect(base.$transaction).toHaveBeenCalledOnce();
  });

  it("rejects array transactions without dispatching their lazy writes", async () => {
    const { base, client, tx } = fixture();
    const guard = vi.fn(async () => undefined);
    await expect(
      withDatabaseWriteGuard(guard, async () => {
        // Reflect models Prisma's array overload without changing the fake client type.
        return await Reflect.apply(client.$transaction, client, [
          [client.item.create("wrong")],
        ]);
      })
    ).rejects.toThrow("non-nested");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(tx.item.create).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });

  it("keeps parallel invocation authority separate", async () => {
    const { client, tx } = fixture();
    const denied = withDatabaseWriteGuard(
      () => Promise.reject(new Error("denied")),
      () => client.item.create("wrong")
    );
    const allowed = withDatabaseWriteGuard(
      async () => undefined,
      () => client.item.create("right")
    );
    const results = await Promise.allSettled([denied, allowed]);
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(tx.item.create).toHaveBeenCalledExactlyOnceWith("right");
  });

  it("does not replace established invocation authority", async () => {
    const { client, rows } = fixture();
    await expect(
      withDatabaseWriteGuard(
        () => Promise.reject(new Error("outer")),
        async () =>
          withDatabaseWriteGuard(
            async () => undefined,
            () => client.item.create("wrong")
          )
      )
    ).rejects.toThrow("cannot be replaced");
    expect(rows).toEqual([]);
  });

  it("refuses a lazy write first awaited after its owning invocation returns", async () => {
    const { base, client, rows } = fixture();
    let captured: Promise<string> | undefined;
    await withDatabaseWriteGuard(
      () => Promise.resolve(),
      () => {
        captured = client.item.create("escaped");
        return Promise.resolve();
      }
    );
    await expect(Promise.resolve(captured)).rejects.toThrow(
      "invocation has closed"
    );
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it("keeps an escaped method and delegate bound to their closed originating authority", async () => {
    const { base, client, rows } = fixture();
    let capturedMethod: typeof client.item.create | undefined;
    let capturedDelegate: typeof client.item | undefined;
    await withDatabaseWriteGuard(
      () => Promise.resolve(),
      () => {
        capturedMethod = client.item.create;
        capturedDelegate = client.item;
        return Promise.resolve();
      }
    );
    expect(() => capturedMethod?.("escaped method")).toThrow(
      "invocation has closed"
    );
    expect(() => capturedDelegate?.create("escaped delegate")).toThrow(
      "invocation has closed"
    );
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it("denies deferred work that inherited an already closed async context", async () => {
    const { base, client, rows } = fixture();
    const start = barrier();
    let background: Promise<unknown> | undefined;
    await withDatabaseWriteGuard(
      () => Promise.resolve(),
      () => {
        background = start.promise.then(() =>
          client.item.create("escaped task")
        );
        return Promise.resolve();
      }
    );
    const rejected = expect(background).rejects.toThrow(
      "invocation has closed"
    );
    start.resolve();
    await rejected;
    expect(base.$transaction).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it("drains and rolls back a detached transaction that was waiting for admission", async () => {
    const { base, client, rows, tx } = fixture();
    const guardEntered = barrier();
    const releaseGuard = barrier();
    let detached: Promise<unknown> | undefined;
    let closed = false;
    const invocation = withDatabaseWriteGuard(
      async () => {
        guardEntered.resolve();
        await releaseGuard.promise;
      },
      async () => {
        detached = client.item
          .create("detached")
          .catch((error: unknown) => error);
        await guardEntered.promise;
      }
    );
    const finished = invocation.finally(() => {
      closed = true;
    });
    const rejected = expect(finished).rejects.toThrow(
      "unawaited guarded transactions"
    );
    await guardEntered.promise;
    await new Promise((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    releaseGuard.resolve();
    await rejected;
    await expect(detached).resolves.toBeInstanceOf(Error);
    expect(base.$transaction).toHaveBeenCalledOnce();
    expect(tx.item.create).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
    expect(closed).toBe(true);
  });

  it("does not commit a detached write after invocation closure while its result is pending", async () => {
    const { client, rows, tx } = fixture();
    const written = barrier();
    const finishWrite = barrier();
    tx.item.create.mockImplementation((value) => {
      rows.push(value);
      written.resolve();
      return finishWrite.promise.then(() => value);
    });
    let detached: Promise<unknown> | undefined;
    const invocation = withDatabaseWriteGuard(
      () => Promise.resolve(),
      async () => {
        detached = client.item
          .create("must rollback")
          .catch((error: unknown) => error);
        await written.promise;
      }
    );
    const rejected = expect(invocation).rejects.toThrow(
      "unawaited guarded transactions"
    );
    await written.promise;
    await new Promise((resolve) => setImmediate(resolve));
    finishWrite.resolve();
    await rejected;
    await expect(detached).resolves.toBeInstanceOf(Error);
    expect(rows).toEqual([]);
  });

  it("closes authority on failure and refuses pending lazy work", async () => {
    const { base, client } = fixture();
    let pending: Promise<string> | undefined;
    await expect(
      withDatabaseWriteGuard(
        () => Promise.resolve(),
        () => {
          pending = client.item.create("abandoned");
          return Promise.reject(new Error("action failed"));
        }
      )
    ).rejects.toThrow("action failed");
    await expect(Promise.resolve(pending)).rejects.toThrow(
      "invocation has closed"
    );
    expect(base.$transaction).not.toHaveBeenCalled();
  });
});
