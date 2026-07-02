# Plan 008: Design the weekly "who's out" manager digest (spike, doc-only)

> **Executor instructions**: This is a design/spike plan. Your deliverable is a
> written report, not code. Do not modify any file outside `plans/`. If
> anything in the "STOP conditions" section occurs, stop and report. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- packages/notifications packages/jobs packages/availability/src/dashboard`
> If these areas changed materially since this plan was written, compare the
> "Current state" notes against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S (spike; the build it specifies is M)
- **Risk**: LOW (doc-only)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

PRODUCT.md describes team managers as users who "visit frequently, often briefly" with a success metric of "a team manager arrives, scans their calendar, and is back to work in under 30 seconds". A Monday-morning email summarising who is out this week serves that exact behaviour without requiring a visit at all. Every ingredient already exists: team-scoped availability queries power the dashboard's manager view, the notification system has per-type preferences with email channels, Inngest handles scheduling, and React Email plus Resend handle dispatch. What does not exist is any digest concept: the notification type registry (`packages/notifications/src/types/notification-type-registry.ts`) contains only per-event transactional types (verified: no digest entry). This spike designs the digest end to end so the build is a mechanical M-effort task.

## Current state

- `packages/notifications/src/types/notification-type-registry.ts` - the registry of notification types. Entry shape (from the `feed_token_rotated` entry at lines 139-150): `{ type, label, shortLabel, iconKey, description, defaultChannels: { inApp, email }, supportsActionUrl, userFacingCategory, emailTemplate, actionLabel }`. No digest or summary type exists.
- `packages/notifications/src/dispatch.ts` and `notification-service.ts` - creation and delivery; `dispatchNotification(...)` is the entry point used by domain code (see exemplar `packages/availability/src/plans/submit-service.ts:604-640`, `notifyManager`, which resolves `record.person.manager?.clerk_user_id` as the recipient).
- `packages/availability/src/dashboard/dashboard-service.ts` - `getManagerView` computes team availability for the dashboard (also `listTeamRecords` in `packages/availability`). These are the query candidates for the digest body.
- `packages/jobs` - Inngest job definitions; check how existing scheduled jobs declare cron triggers (the sync scheduling jobs) to reuse the pattern.
- Schema facts (from `packages/database/prisma/schema.prisma`): `teams.manager_person_id` identifies a team's manager; `notification_preferences` is unique on `(user_id, organisation_id, notification_type)` with defaults "in-app enabled, email enabled for all types" (PRODUCT.md non-negotiable; note the tension with a digest, where in-app default probably should be off, and address it in the report).
- Email templates: React Email templates developed in `apps/email`, consumed via `packages/email`, dispatched via Resend. The registry's `emailTemplate` field carries a template name string; how that string maps to an actual template is part of what this spike must document (see plan 009's related finding that `FeedTokenRotated` is named in the registry but appears nowhere else).

Constraints to honour: PRODUCT.md brand ("Modern. Calm. Precise.", no noise); privacy rules live in `packages/availability` and any digest content must respect them (a manager sees their direct reports' leave already, but confirm the privacy model for manual entries); Australian English; no em dashes; timezone utilities live in `packages/core`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm no source changes | `git status --short` | only files under `plans/` |

## Scope

**In scope** (files you may create or modify):

- `plans/008-report-manager-digest.md` (create; the deliverable)
- `plans/README.md` (status row)

**Out of scope**: all source code.

## Steps

### Step 1: Document the reusable ingredients

Read and summarise with file:line citations: the registry entry shape and how `emailTemplate` strings resolve to sent email (trace one existing emailed type, e.g. `sync_failed`, from registry through `dispatch.ts` to `packages/email`); how `getManagerView`/`listTeamRecords` scope queries (inputs, privacy filtering, date windows); how an existing scheduled Inngest job declares its cron and carries `clerkOrgId`/`organisationId`; and how `teams.manager_person_id` connects a manager to reportees (including people with no team, and managers of multiple teams).

**Verify**: report section "Ingredients" exists with citations.

### Step 2: Specify the digest

Define in the report:

1. **Registry entry**: a full `leave_digest` (or better-named) entry in the exact registry shape, with recommended `defaultChannels` and the reasoning (suggested: email on, in-app off; reconcile explicitly with the PRODUCT.md default-on non-negotiable, and if they conflict, present both readings and flag for the maintainer).
2. **Content**: what one digest contains (this week's absences by day, next week preview, WFH/travel entries, public holidays), what it omits (privacy-masked records), and the empty-state rule (suggested: skip sending when nothing to report, and say why).
3. **Recipients**: how the job resolves recipients (team managers via `manager_person_id` with a linked `clerk_user_id`; what happens for org admins/owners without teams).
4. **Scheduling**: cron design and the timezone problem (organisations span timezones via Locations; propose per-organisation send-hour with a documented default, e.g. Monday 07:00 in the organisation's primary timezone, and state where that timezone comes from).
5. **Delivery shape**: one email per manager per organisation; whether an in-app notification row is also created; idempotency (what prevents double-sends if the job retries; Inngest retry semantics matter here).

**Verify**: report section "Specification" covers all five headings.

### Step 3: Build plan skeleton and open questions

List the files the build would touch (registry, new Inngest job in `packages/jobs/src/handlers/`, email template in `apps/email` + `packages/email`, preferences UI if the type must appear there), a test list per repo conventions (co-located, fixture-based date-window cases including week boundaries and timezone edges), a coarse effort estimate, and open questions each with a suggested default (at minimum: send day/hour, plan-gating - is the digest a premium `analytics`-adjacent feature or free, and whether viewers/admins can opt in).

**Verify**: report sections "Build skeleton" and "Open questions" exist; `git status --short` shows only `plans/` changes.

## Test plan

Not applicable (doc-only). The report's test list becomes the build's test plan.

## Done criteria

- [ ] `plans/008-report-manager-digest.md` exists with sections: Ingredients, Specification, Build skeleton, Open questions
- [ ] Every repo claim cites file:line; assumptions are labelled
- [ ] The registry-entry proposal is in the exact shape of existing entries
- [ ] `git status --short` shows changes only under `plans/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `emailTemplate` string-to-template mapping cannot be traced end to end for any existing type (that means the email leg of ALL registry types needs investigation first; report it as a standalone finding).
- Privacy filtering for manager views turns out not to exist in the availability queries (the digest would leak masked records; the design cannot proceed on that assumption).
- Any step tempts you to modify source code.

## Maintenance notes

- If plan 009 (token rotation notification) is executed first, its findings about the `emailTemplate` wiring feed directly into step 1 here; note in the report whichever plan traced it first.
- The digest is the natural home for future ambient signals (plan-limit warnings, sync-health summaries); the report should keep the content model extensible but must not design those now.
