# Blocked items needing a human decision

No open blockers remain.

## 1. "Workspace" vs "Organisation" labelling in `settings/general` (RESOLVED)

This was the one item left for a human decision during the pre-launch cleanup
(Phase 4): the General settings screen rendered a "Workspace" card (the Clerk
Organisation) next to an "Organisation" card (the payroll entity), and renaming
"workspace" naively would have conflated the two tenancy levels.

**Decision (applied in this PR):**
- The top-level tenant (Clerk Organisation, read from Clerk) is labelled
  **"Account"**.
- The payroll-entity `Organisation` row is labelled **"Payroll entity"**.
- The word "workspace" is removed from the product entirely, in UI copy and code
  identifiers.

Applied: Card 1 is "Account" (name/slug, "No active account selected"); Card 2 is
"Payroll entity" with its fields and behaviour unchanged; the `GeneralClient`
`workspace` prop is `account`, `updateWorkspaceNameAction` is
`updateAccountNameAction`, `WorkspaceNameSchema` is `AccountNameSchema`, and the
audit action string is `account.name_changed`. The related billing copy in
`packages/availability/src/settings/billing-service.ts` and the dashboard/billing
UI now use "account owner" / "this account".
