# Blocked items needing a human decision

These were found during the pre-launch cleanup (Phase 4) and are load-bearing in
a way that is not pure naming, so they were left unchanged pending a decision, as
the task instructs.

## 1. "Workspace" vs "Organisation" labelling in `settings/general`

Files:
- `apps/app/app/(authenticated)/settings/general/general-client.tsx`
- `apps/app/app/(authenticated)/settings/general/page.tsx`
- `apps/app/app/(authenticated)/settings/general/_actions.ts`

The General settings screen renders two distinct cards:

1. A **"Workspace"** card showing the Clerk Organisation's `name` and `slug`
   (read from Clerk via `clerk.organizations.getOrganization`). In PRODUCT.md
   terms this is the **Clerk Organisation**, the top-level tenant.
2. An **"Organisation"** card editing the payroll-entity `Organisation` row
   (country, region, timezone, name).

PRODUCT.md uses "Clerk Organisation" for the top-level tenant and "Organisation"
for the payroll entity within it. Blindly replacing "workspace" with
"organisation" here would produce two identically named "Organisation" cards and
conflate the two tenancy levels, which is a user-visible behaviour change, not a
copy tidy-up.

The "workspace" identifiers involved (load-bearing, left as-is): the `workspace`
prop on `GeneralClient`, `updateWorkspaceNameAction` / `WorkspaceNameSchema` in
`_actions.ts`, the audit action string `organisation.workspace_name_changed`, and
the card copy ("Workspace name", "Workspace slug", "No active workspace selected").

**Question for a human:** What should the Clerk-Organisation-level card be called
so it stays distinct from the payroll-entity "Organisation" card? Candidate
labels: "Organisation" (with the payroll card renamed to "Payroll entity" or
"Legal entity"), "Account", or keep "Clerk Organisation" verbatim from PRODUCT.md.
Once the label is chosen, the prop, action, schema, and audit-action identifiers
can be renamed to match in the same change.

A related copy string ("workspace owner", "this workspace") also appears in
`packages/availability/src/settings/billing-service.ts`. That package is on the
hard "do not touch" list for this task, so it was left unchanged. It should be
revisited alongside this decision once the labelling is settled.
