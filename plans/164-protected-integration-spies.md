# Protected integration spy compatibility

Scope: repair the actual live failure where Vitest cannot spy on dynamically
exposed guarded Prisma delegate methods. Three registered protected suites use
these spies to allocate owned IDs, constrain discovery and inject one controlled
persistence failure. Preserve every case, assertion, fixture selector and real
database transaction. Do not modify the production write guard.

- [x] Reproduce the missing-own-property failure in three focused tests.
- [x] Provide a test-only delegate facade and wire only the three protected suites.
- [x] Prove default writes still execute both guard checks and spy restoration.
- [ ] Run source gates, freeze source and replay through the protected live runner.

Source verification: four facade regressions pass, including forwarding through
both real write-guard checks, restoration, and ordinary fixture cleanup after
guarded invocation. Root lint, all 19 type projects and all 18 unit tasks pass.
The six protected Xero files still skip credential-free collection. Live replay
is pending at the repaired candidate. Production write-guard code is unchanged.
