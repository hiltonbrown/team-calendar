# Plan 008 Design Spike Report: Weekly Manager Digest

> **Historical design deliverable**: Reconciled on 2026-07-12 at `2bba19c`.
> The digest remains unimplemented. The `file://` citations below point to the
> executor's former worktree and are retained only as historical evidence.
> Revalidate every source reference before producing an implementation plan.
> The missing notification email queue consumer remains a prerequisite.

This document presents the end-to-end design for the Monday-morning manager weekly availability digest, outlining current ingredients, a detailed specification, build skeleton, and open questions.

## 1. Ingredients

### 1.1 Notification Type Registry & Email Flow
- **Registry Structure**: The notification type registry is located at [notification-type-registry.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/types/notification-type-registry.ts#L30-L163). Each entry conforms to the `NotificationTypeConfig` interface (defined at [notification-type-registry.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/types/notification-type-registry.ts#L10-L21)), which specifies:
  - `type`: `notification_type` enum (defined in Prisma schema).
  - `label` & `shortLabel`: String descriptors.
  - `iconKey`: Lucide icon key string.
  - `description`: User-facing description.
  - `defaultChannels`: `{ inApp: boolean; email: boolean }` object.
  - `supportsActionUrl`: Boolean.
  - `userFacingCategory`: `NotificationCategory` union type.
  - `emailTemplate`: String template identifier or `null`.
  - `actionLabel`: Action button text.
- **Email Resolution Flow**: When `dispatchNotification` (defined in [dispatch.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/dispatch.ts#L32)) is called:
  1. It checks the recipient's notification preference (defaults to enabled for all channels and types).
  2. If email is enabled, it resolves the `emailTemplate` using `emailTemplateForType` (defined in [notification-type-registry.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/types/notification-type-registry.ts#L208-L210)).
  3. It calls `enqueueNotificationEmail` (defined in [email-queue-service.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/email-queue-service.ts#L29-L69)) which writes a row into the `notification_email_queue` table with the template name and JSON merge data.
  4. **CRITICAL FINDING**: A repository-wide code audit reveals that enqueued email queue rows are never processed. There is no active worker, Inngest job, or background processor that polls `notification_email_queue` and sends emails via Resend. The only active usage of `resend.emails.send` is inside the public contact form action ([contact.tsx](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/apps/web/app/contact/actions/contact.tsx#L20)).
- **Template Layout**: Email templates live in `packages/email/templates/` (e.g. [notification.tsx](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/email/templates/notification.tsx#L28)) is the generic layout `NotificationEmailTemplate` rendering the notification title and body with a CTA button.

### 1.2 Availability Query Scoping & Privacy Filtering
- **Query Scoping**: Manager calendar queries leverage `getCalendarRange` (defined in [calendar-service.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/availability/src/calendar/calendar-service.ts#L222)), passing `scope: { type: "my_team" }` and `role: "manager"`.
- **Hierarchical Scoping**: Direct and indirect reports are resolved using `managerScopePersonIds` (defined in [manager-scope.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/availability/src/settings/manager-scope.ts#L6-L44)). If `managerVisibilityScope` in settings is `"all_team_leave"`, it uses `transitiveReportIds` (defined in [manager-scope.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/availability/src/settings/manager-scope.ts#L46-L74)) to perform a breadth-first search down the manager-employee hierarchy; otherwise, it limits the scope to direct reports.
- **Privacy Filtering**: Privacy rules are applied at render time via `toCalendarEvent` (defined in [calendar-service.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/availability/src/calendar/calendar-service.ts#L697-L745)). It evaluates `relationshipToOwner(actor, targetPerson)` (defined at [calendar-service.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/availability/src/calendar/calendar-service.ts#L780-L801)):
  - If the relationship is `"manager"` (meaning the target person reports directly or transitively to the actor), `canSeeSensitive` is set to `true`.
  - If the relationship is `"peer"`, privacy masking is applied based on the record's `privacy_mode` (e.g. setting display name to "Unavailable" for `private` or "Team member" for `masked`).
  - Because managers are the actors viewing their own teams, they have full visibility of all team records (no privacy masking is applied).

### 1.3 Inngest Scheduled Job Patterns
- **Trigger Patterns**: Existing Inngest functions are defined in `packages/jobs/src/handlers/`. None of them use Inngest's native cron trigger. They are all event-triggered (e.g., `triggers: { event: "sync-xero-people" }` in [sync-xero-people.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/jobs/src/handlers/sync-xero-people.ts#L56)).
- **Tenant Context Propagation**: Event-triggered jobs carry explicit tenant boundaries in their payload (e.g., `clerkOrgId` and `organisationId`), validated using Zod schemas at the start of execution.
- **Vercel Crons**: In [vercel.json](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/apps/api/vercel.json#L5-L10), a single cron job is declared pointing to `/cron/keep-alive` running daily at 01:00 AM UTC.

### 1.4 Manager-to-Reportee Connection
- **Recursive Hierarchy Schema**: The database model `Person` (defined in [schema.prisma](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/database/prisma/schema.prisma#L352-L397)) implements a recursive hierarchy. The self-referential foreign key `manager_person_id` points back to another `Person` record in the same organisation.
- **Plan Misconception**: The plan notes state that `teams.manager_person_id` identifies a team's manager. This is incorrect. There is no `manager_person_id` column on the `Team` model (defined at [schema.prisma](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/database/prisma/schema.prisma#L327-L341)). Managers are linked directly to reportees via the `Person.manager_person_id` column.
- **Scoping Invariants**:
  - People with no team (where `team_id` is null) are still scoped correctly under their manager as long as their `manager_person_id` points to the manager.
  - A manager managing people across multiple teams is correctly resolved because the relationship is established person-to-person rather than team-to-team.

---

## 2. Specification

### 2.1 Registry Entry
To implement this feature, the `notification_type` enum must be updated in [schema.prisma](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/database/prisma/schema.prisma#L188-L200) to include `manager_weekly_digest`.
A corresponding registry entry in [notification-type-registry.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/types/notification-type-registry.ts) will be created:

```typescript
  {
    type: "manager_weekly_digest",
    label: "Manager weekly digest",
    shortLabel: "Weekly digest",
    iconKey: "calendar-days",
    description: "A weekly Monday-morning summary of your team's availability and leave.",
    defaultChannels: { inApp: false, email: true },
    supportsActionUrl: true,
    userFacingCategory: "system",
    emailTemplate: "ManagerWeeklyDigest",
    actionLabel: "Open calendar",
  }
```

*Reasoning for Default Channels*: Transactional emails are default-on. Because this digest is a weekly compilation rather than a real-time event, creating an in-app notification row would clutter the user's notification bell. Thus, `inApp` is disabled by default, and `email` is enabled by default. Since PRODUCT.md states that preferences default to "in-app enabled, email enabled for all types", a conflict exists. We recommend updating the preference loading layer ([preferences-service.ts](file:///home/hilton/.gemini/antigravity-cli/brain/0687071b-abf4-40f1-b19b-be5105c0660b/.system_generated/worktrees/subagent-Plan-008-Executor-self-b23bf589/packages/notifications/src/preferences-service.ts)) to honour registry-defined `defaultChannels` on first-time setup or when no database record exists, rather than hardcoding `true` for both channels.

### 2.2 Digest Content
The weekly digest contains a clear, structured preview of the upcoming week:
1. **Absences by Day**: A day-by-day calendar view (Monday through Sunday of the current week) listing all approved out-of-office records (leaves, holidays, annual/sick leave).
2. **Next Week Preview**: A summary of upcoming leaves starting the following week (Monday through Sunday) to help managers plan ahead.
3. **Manual Availability Entries**: Manual entries (such as WFH, travelling, training, client site) grouped separately or inline by day to maintain a calm, precise view of team presence.
4. **Public Holidays**: List of public holidays applicable to the organisation's locations for the current week.
5. **Omitted Content**:
   - Draft or pending availability records (unless settings explicitly allow pending visibility, which is not recommended for weekly summaries).
   - Declined or cancelled leave records.
   - Any private records outside the manager's hierarchy tree.
6. **Empty-State Rule**: If there are no team absences, manual entries, or public holidays for both the current week and next week, the digest email will **not** be sent. This prevents inbox noise and aligns with our "Calm" brand principle.

### 2.3 Recipients
Recipients are determined by querying the `Person` model to find all individuals who act as managers:
- **Query**: Select all distinct `manager_person_id` values from the `Person` table within the organisation where `archived_at` is null and `is_active` is true.
- **Link**: Resolve each manager's `clerk_user_id` and `email` address.
- **Org Admins & Owners**: Admins and owners who do not have direct reports do not receive the digest by default (since they have no team to summarize). They can optionally opt in via their notification preferences screen if they wish to receive the entire organisation's digest.

### 2.4 Scheduling
- **Trigger**: An Inngest cron job triggers every Monday morning.
- **Timezone Handling**: Organizations can span multiple timezones. Rather than sending digests at the same UTC instant, the send time must be local to each organisation.
- **Primary Timezone Resolution**:
  - We look up the manager's `location.timezone` (from their location relationship).
  - If null, we fall back to the `organisation.timezone` default.
  - If that is also null, we fall back to `"UTC"`.
- **Dispatcher Pattern**: To avoid timezone complexity and ensure tenant boundaries are respected, the cron job executes as a global scheduler:
  1. A daily/hourly global cron handler checks which manager timezones have hit Monday 07:00 AM.
  2. For each eligible manager, it dispatches a manager-specific Inngest event: `manager-weekly-digest.send` carrying `{ clerkOrgId, organisationId, managerPersonId }`.
  3. The handler for `manager-weekly-digest.send` runs in parallel, queries availability data, and queues the email.

### 2.5 Delivery Shape & Idempotency
- **Shape**: One email per manager, per organisation. If a manager manages people in two separate organizations, they receive two separate digests. In-app notifications are skipped (disabled by default in the registry).
- **Idempotency Strategy**: To prevent double-sends if the Inngest cron or dispatcher retries:
  - Generate a deterministic idempotency key for the email queue: `weekly-digest-<organisation_id>-<manager_person_id>-<week_start_date>`.
  - Save this key on the dispatch record or use Inngest's built-in deduplication. This ensures that even on retry, the system will never queue or send duplicate digests for the same week.

---

## 3. Build Plan & Open Questions

### 3.1 Files to Touch
- `packages/database/prisma/schema.prisma`: Add `manager_weekly_digest` to `notification_type` enum.
- `packages/notifications/src/types/notification-type-registry.ts`: Add registry entry.
- `packages/notifications/src/preferences-service.ts`: Update default preference loading logic to support default-off in-app channels.
- `packages/jobs/src/handlers/manager-weekly-digest.ts` (new file): Implement global scheduler and manager-specific sender function.
- `packages/jobs/src/functions.ts`: Register the new Inngest handlers.
- `packages/jobs/src/events.ts`: Register event schemas.
- `apps/email/emails/manager-weekly-digest.tsx` (new file): React Email template for digest email.
- `packages/email/templates/manager-weekly-digest.tsx` (new file): Export the React Email template.

### 3.2 Test List
- `packages/jobs/src/handlers/manager-weekly-digest.test.ts`:
  - Assert the scheduler correctly filters organisations and managers based on local time.
  - Test week-boundary edge cases (Sunday 23:59 vs Monday 00:01).
  - Test date-window calculation for timezone offsets (+14:00 to -12:00).
  - Assert empty-state rules: do not send when no records exist.
  - Assert correct privacy boundaries: manager only sees their reports.

### 3.3 Coarse Effort Estimate
- **Total Effort**: M (estimated at 3-5 developer days).
  - Template design and React Email integration: 1.5 days.
  - Inngest scheduling and timezone dispatcher logic: 1.5 days.
  - Test suite and preference UI integration: 1 day.

### 3.4 Open Questions
1. **Default Send Time**: Propose Monday 07:00 AM local time. Should managers have the ability to customise this hour? (Default: No, keep it static to simplify scheduling).
2. **Pricing Tier**: Is the weekly digest a premium feature limited to `enterprise`/`premium` plans, or free? (Default: Free for all tiers to drive engagement and retention).
3. **In-App Opt-in**: Should we support an in-app digest feed if the user turns on in-app notifications for this type? (Default: No, email only; in-app toggle is disabled or hidden for this type).
