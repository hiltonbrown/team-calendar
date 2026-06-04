# Deferred screens (post-launch)

Launch is AU-only and English-only, delivering the core loop. The screens below
were removed from the build path in Phase 3 to cut the UI surface to the launch
core. All database schema, migrations, and domain packages remain intact, so
each screen can be re-enabled post-launch by restoring its route directory from
git history (the deletion commit on `chore/pre-launch-cleanup`) and re-adding its
navigation entry.

| Removed route (apps/app) | Why deferred | How to re-enable |
|---|---|---|
| `analytics/leave-reports` | Reporting is post-core (build order step 15). Not in the launch loop. | Restore `(authenticated)/analytics/` (the two report pages plus the shared `_actions`, `_schemas`, `_components`, `drill-down-url`) and the "Reports" nav group in `components/sidebar.tsx`. Re-add the `/analytics/*` revalidatePath entries removed from the availability and settings actions. |
| `analytics/out-of-office` | As above. | As above (same `analytics` directory). |
| `sync/[runId]` | Sync run drill-down detail is not required for launch; the sync list view is retained for health visibility. | Restore `(authenticated)/sync/[runId]/` and the "View" link/column plus the `/sync/<runId>` revalidate in `sync/_actions.ts`. **Known consequence:** the protected `packages/jobs` handler `reconcile-xero-approval-state.ts` still emits notifications with `actionUrl: /sync/<runId>`. While this screen is deferred those deep links resolve to the `/sync` list as a not-found fallback rather than a run detail. `packages/jobs` is on the hard do-not-touch list, so the `actionUrl` was left as-is; restoring this route re-enables the deep link. A thin `/sync/[runId]` redirect to `/sync` is an alternative if the 404 is undesirable before the screen returns. |
| `settings/audit-log` | Audit reporting UI is post-core (build order step 16). Audit events are still written; only the viewer is deferred. | Restore `(authenticated)/settings/audit-log/`, the "Audit Log" item in `settings/components/settings-nav.tsx`, and the `RecentAuditEventsCard` in `components/dashboard/admin-view.tsx` (card component restored from git). |
| `public-holidays/import` | Bulk holiday import is not in the launch loop; the read-only public holidays view and single custom-holiday add are retained. | Restore `(authenticated)/public-holidays/import/` and the "Import holidays" buttons in `public-holidays-list.tsx` and `settings/holidays/holidays-client.tsx`. |
| `workspaces` | The workspace concept is eliminated in PRODUCT.md; the tenant boundary is the Clerk Organisation. This screen should not return as-is. | Not intended for re-enablement. Tenant switching is handled by Clerk's `<OrganizationSwitcher />`. |
| `webhooks` | Out of launch scope and powered by the forbidden `@repo/webhooks` package (removed in Phase 1). | Not intended for re-enablement under the current architecture. |
| `settings/danger` | Destructive account actions are deferred from launch. | Restore `(authenticated)/settings/danger/` and the "Danger Zone" item in `settings/components/settings-nav.tsx`. |
| `support` | Uncatalogued; not in the launch scope. The apps/api support endpoint is untouched. | Restore `(authenticated)/support/` and the "Support & Feedback" footer item in `components/sidebar.tsx`. The `app/actions/support/submit-ticket.ts` server action was also removed (orphaned); restore it if the support form needs it. |
| `search` | Uncatalogued; global search is not in the launch scope. | Restore `(authenticated)/search/` and `(authenticated)/components/search.tsx` (the search form component was orphaned and removed with it), then render the component where global search is wanted. |

## Tests removed with deleted code

The following co-located tests were deleted because the code they covered was
removed (Phase 3). They are recoverable from git alongside their routes:

- `(authenticated)/analytics/_actions.test.ts`
- `(authenticated)/analytics/drill-down-url.test.ts`
- `(authenticated)/support/support-client.test.tsx`

No test was deleted whose covered code still exists.
