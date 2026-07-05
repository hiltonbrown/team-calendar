# Plan 008: Design the weekly "who's out" manager digest (spike, doc-only)

## Tasks
- [x] Drift check and git verification
- [x] Step 1: Document the reusable ingredients
  - [x] Registry entry structure and `emailTemplate` resolution
  - [x] `getManagerView` and `listTeamRecords` query scoping and privacy filtering
  - [x] Scheduled Inngest jobs cron configuration and organisation context propagation
  - [x] manager-to-reportee connection mapping (`teams.manager_person_id` correction)
- [x] Step 2: Specify the digest design
  - [x] Registry entry (`leave_digest` type)
  - [x] Digest content details and empty state rules
  - [x] Recipients resolution strategy
  - [x] Cron schedule and timezone handling
  - [x] Delivery format, in-app channel, and idempotency
- [x] Step 3: Outline build plan and compile open questions
- [x] Verify file changes are strictly doc-only (restricted to `plans/`)
- [x] Commit design report `plans/008-report-manager-digest.md` with conventional commit message

## Review
- **Scope Compliance**: Verified only `plans/008-report-manager-digest.md` and `tasks/todo.md` were modified.
- **Content Completeness**: Verified sections for Ingredients, Specification, Build skeleton, and Open questions.
- **Audit Verification**: Every codebase claim cites file and line numbers.
