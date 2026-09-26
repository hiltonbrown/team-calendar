export function reconcileReleaseTeardown(hooks: {
  inspectCleanup: () => void;
  assertLedger: () => void;
  applyCleanup: () => void;
  assertClean: () => void;
}) {
  // Read-only reconciliation runs even when a create is unresolved. The existing
  // all-fixture deletion cannot safely delete independent subsets, so it stays
  // fenced until the ledger proves all remote associations are reconciled.
  try {
    hooks.inspectCleanup();
  } catch {
    /* Residue is expected before cleanup. */
  }
  hooks.assertLedger();
  hooks.applyCleanup();
  hooks.assertClean();
}
