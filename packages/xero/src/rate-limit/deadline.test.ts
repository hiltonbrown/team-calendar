import { expect, it } from "vitest";
import { createXeroDeadline, remainingMs } from "./deadline";

it("uses one absolute expiry and clamps remaining time", () => {
  let now = 100;
  const deadline = createXeroDeadline(50, () => now);
  expect(remainingMs(deadline, () => now)).toBe(50);
  now = 125;
  expect(remainingMs(deadline, () => now)).toBe(25);
  now = 200;
  expect(remainingMs(deadline, () => now)).toBe(0);
});
