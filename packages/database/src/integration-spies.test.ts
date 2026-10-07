import { describe, expect, it, vi } from "vitest";
import { createSpyableDatabase } from "./integration-spies";

describe("integration database spies", () => {
  it("forwards ordinary delegate operations after restoring a spy", async () => {
    const findMany = vi.fn(async () => [{ id: "owned" }]);
    const database = createSpyableDatabase(
      { xeroAuthorisation: { findMany } },
      { xeroAuthorisation: ["findMany"] }
    );
    const spy = vi
      .spyOn(database.xeroAuthorisation, "findMany")
      .mockResolvedValueOnce([]);
    expect(await database.xeroAuthorisation.findMany()).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(await database.xeroAuthorisation.findMany()).toEqual([
      { id: "owned" },
    ]);
    expect(findMany).toHaveBeenCalledOnce();
  });
});
