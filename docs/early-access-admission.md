# AU early access admission

Public applications are delivered to the private mailbox configured by `EARLY_ACCESS_APPLICATION_RECIPIENT`.

Before production admission, the operator must configure and verify the mailbox controls:

- identify the recipient account and the named admission staff who can access it;
- restrict mailbox access to those staff;
- configure a rule that removes rejected applications and correspondence with no admission activity after 90 days;
- set and staff the monitoring window, currently planned for Monday–Friday, 9 am–5 pm AEST, with acknowledgement within two business days; and
- save provider evidence for the account, access list, retention rule, and a successful delivery test in the release evidence archive.

Do not record these controls as complete until the mail provider evidence has been captured.

Applications never contain payroll or leave attachments. The public form tells applicants not to include payroll records, leave records, or employee personal information. Application content stays out of logs and analytics.

Admission is separate from application delivery:

1. An authorised operator reviews the private application.
2. The operator creates a Clerk application/user invitation for the accepted owner. They do not use the in-product member invitation, because that invitation belongs to an existing customer organisation.
3. Clerk must run in invite-only access mode. Direct sign-up without a verified `__clerk_ticket` redirects to the application form. Existing users continue through sign-in.
4. The invited owner completes sign-up and creates their own Clerk Organisation through the choose-organisation session task. Clerk's organisation creator role must be configured as `org:owner`.
5. The owner invites later team members from their own organisation.

Before production admission, verify an expired invitation and a revoked invitation cannot sign up, an existing invited user can sign in, and an authenticated user can complete `/session-tasks/choose-organization`. Record the Clerk dashboard change and test evidence in the release evidence archive.

Activation analytics use the version-one catalogue in `packages/analytics/activation-events.ts`. Events contain a pseudonymous subject, stable deduplication UUID, event name/version, and no application content, leave data, feed URL, or provider payload.
