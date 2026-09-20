# Vercel environment review, 20 September 2026

Downloaded Production, Preview and Development configuration for teamcalendar-api,
teamcalendar-app and teamcalendar-web. Reviewed all nine downloads and Vercel
environment metadata. No remote configuration changed. Values are intentionally
excluded from this report.

| Area | Finding |
| --- | --- |
| Neon | API and app have DATABASE_URL in all three environments. All six downloads use the same endpoint, database and credentials. Development and Preview therefore currently target the production database. |
| KV | API has KV_REST_API_URL and KV_REST_API_TOKEN in all environments, using the same endpoint. App and web have no KV pair. |
| Inngest | API has both event and signing keys in all environments. Production uses a production signing key; Preview and Development use a separate non-production key. |
| Contact email | API has RESEND_TOKEN in all environments. RESEND_FROM, EARLY_ACCESS_APPLICATION_RECIPIENT and EARLY_ACCESS_APPLICATION_HMAC_SECRET are configured only for Production. Preview and Development are incomplete for contact delivery using the downloaded configuration alone. |
| Sensitive values | Production contact recipient/HMAC, Xero credentials and public app/API/web URLs are configured as sensitive. Blank downloaded placeholders do not establish missing or invalid deployed values. Their contents were not verified by this review. |
| Neon management | NEON_PROJECT_ID and SQL connection credentials exist. No NEON_API_KEY, alternative recognisable Neon management token, restore reference or release-test manifest setting was found in these environments. SQL access does not establish provider restore readiness. |
| Billing | API has a sensitive Stripe secret in Production/Preview, but no STRIPE_WEBHOOK_SECRET. App has no STRIPE_SECRET_KEY. Billing configuration is incomplete if these flows are to be enabled. |
| Legacy settings | Basehub, Knock, Flags and Svix settings remain in inventories. Presence is not evidence that these services are used; no variables were removed. |

The pulls cover the three standard environment targets, not individual
branch-specific Preview overrides or custom environments. Sensitive values were
classified using metadata rather than inferred from downloaded blanks. API metadata
was fetched separately through the CLI to avoid connector output truncation.

## Database verification

- PASS: live read-only migration audit, all 15 applied checksums match, none pending or unfinished.
- PASS: Prisma schema comparison, no difference detected.
- PASS: no invalid indexes or unvalidated constraints.
- PASS: 49 foreign-key relationships checked for tenant/organisation isolation, no violations.
- PASS: country and Xero connection/tenant uniqueness checks.
- PASS: repository lint, typecheck and unit task suite; release tooling tests (47) and targeted database guard tests (8).
- NOT VERIFIED: complete 21-suite live write integration run. Provider branch/restore evidence and the resulting protected run manifest remain outstanding.

Inngest inspection found no registered production apps or runs at the time of the
check. The runner now supports a strict provider-verified empty-environment path
in addition to paused workers; it does not fabricate pause evidence. This alone
does not satisfy the independent Neon restore gate.

Read-only evidence is retained in /tmp/tc-full-database/readonly-integrity.json
and /tmp/tc-full-database/schema-drift.json. Temporary environment downloads were
removed after review. Existing local application environment files were preserved.
