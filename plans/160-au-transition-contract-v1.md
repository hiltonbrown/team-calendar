# AU transition contract v1

Identifier: `au-contract-v1`. Approved by the user on 2 October 2026: "Approve local submission, Xero creation on manager approval".

This resolves Plan 159 Step 1 for Plan 160. The executable transition table is documented in PRODUCT.md under Outbound write operations. Local submission retains AU eligibility, connection, employee and leave-type mapping, and working-day validation. It creates no payroll leave and no outbound operation. Local decline and withdrawal need no provider call, including during disconnection. Approval repeats current eligibility checks, creates synchronously, and records action `approve` before dispatch. Imported requested leave uses the existing documented approve/reject endpoints. NZ/UK stay unavailable.

## Transition and recovery table

| Starting state | User action | Provider effect | Result |
|---|---|---|---|
| Local draft | Submit | No mutation | Local submitted, manager notified |
| Local submitted | Approve | Create scheduled AU leave once | Approved, employee notified |
| Local submitted | Decline with reason | None | Declined, employee notified |
| Local submitted | Withdraw | None | Withdrawn, manager notified |
| Imported requested | Approve/decline | Approve/reject existing ID | Approved/declined |
| Remote submitted/approved | Withdraw | Reject existing ID where allowed | Withdrawn, preserved on inbound rejection |
| Approval create failed definitively | Explicit retry | New fenced create attempt | Provider outcome determines state |
| Approval create uncertain/accepted but unpersisted | Any retry/edit/withdraw | No mutation | Administrator recovery required |
| Exact verified recovery candidate | Attach | Read verification only | Provider state attached, original actor retained, durable side effects completed |
| Independently proved not created | Record evidence | None | Explicit user retry allowed |
| Legacy app-submitted remote record | Approve/decline | None | Scoped administrator remote-state review required |

## Schema and deployment prerequisite

The existing outbound operation enum only supported `submit`. The approved change adds `approve`; retaining submit as the label for manager creation would misrepresent audit and recovery evidence. Prisma migrate diff generated `20261002000000_approval_create_operation`. It only adds an enum value, with no customer row update/backfill. Apply through the reviewed live migration gate before testing or deploying code that creates approval operations. Existing submit recovery remains supported. An impossible pair of unresolved actions fails closed.

## Provider basis and evidence boundary

The official AU leave application documentation describes API creation as scheduled leave and approve for requested leave: https://developer.xero.com/documentation/api/payrollau/leaveapplications . Context7 `/xeroapi/xero-openapi` was checked for create, approve and reject endpoint contracts on 2 October 2026. Endpoint fixture tests distinguish scheduled creation from requested import; no undocumented requested status is sent. Source changes do not confer payroll authority. The user separately approved at most 20 new Demo Company (AU) leave requests for the seven employees identified in the private authority, dated 2 to 6 November 2026, including approval, decline and withdrawal of those requests only. Admission requires live confirmation of the demo tenant. Existing leave and connection deletion are excluded. No provider mutation has been executed or claimed as tested.

## Verification

Focused availability, database operation, AU adapter/read mapper and inbound job tests cover local actions, reason enforcement, manager authorisation, legacy rows, duplicate claims, uncertain acceptance, recovery actors, and withdrawal intent. The existing registered availability database integration suite adds concurrent approval-operation fencing, tenancy isolation and expiry recovery checks. Live execution remains the protected runner's responsibility; record its actual result in the Plan 160 execution review.


## Action admission deployment prerequisite

All guarded app and API actions require the configured campaign store and initialised authority namespace before rollout. Ordinary manual availability continues to work without Xero tokens or a payroll binding; its admission uses the shared ownership store only. Reserved organisations require an exact authenticated actor, action and canonical target ticket. Missing ownership authority denies the action. Form targets use schema-validated ISO date strings and defaults, omitting absent object fields; Date objects and non-JSON values are rejected. Signed OAuth state carries a distinct session-bound callback ticket. Signed consent cancellation closes that ticket without a token exchange. Tenant selection reconciles the committed binding generation before owned initial-sync children run.
