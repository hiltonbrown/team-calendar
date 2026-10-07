// Consent permits employee writes; Xero's write scopes also authorise reads.
export const XERO_SCOPES =
  "offline_access accounting.settings.read payroll.employees payroll.settings.read";
export function hasXeroCapability(
  granted: readonly string[],
  required: string | readonly string[]
): boolean {
  const capabilities = typeof required === "string" ? [required] : required;
  return capabilities.every(
    (scope) =>
      granted.includes(scope) ||
      (scope.endsWith(".read") && granted.includes(scope.slice(0, -5)))
  );
}
