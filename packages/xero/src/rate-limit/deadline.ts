export interface XeroDeadline {
  readonly expiresAtMs: number;
}
export function createXeroDeadline(
  budgetMs: number,
  now: () => number = Date.now
): XeroDeadline {
  return { expiresAtMs: now() + Math.max(0, budgetMs) };
}
export function remainingMs(
  deadline: XeroDeadline,
  now: () => number = Date.now
): number {
  return Math.max(0, deadline.expiresAtMs - now());
}
