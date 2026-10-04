# AU transition contract v1

Identifier: `au-contract-v1`. Approved by the user on 2 October 2026: "Approve local submission, Xero creation on manager approval". Implemented in `37b4818`. PRODUCT.md (Outbound write operations) carries the same table.

## Rules

- **Submit** is local. It validates AU eligibility, connection, employee and leave-type mapping, and working days. It creates no Xero leave and no outbound operation.
- **Approve** of a local request repeats those checks, records an outbound operation with action `approve` before dispatch, then creates scheduled AU leave in Xero synchronously.
- **Decline** (reason required) and **withdraw** of a local request make no provider call, including while disconnected.
- **Imported requested leave** uses Xero's existing approve and reject endpoints.
- NZ and UK stay unavailable.

## Transition table

| Starting state | User action | Provider effect | Result |
| --- | --- | --- | --- |
| Local draft | Submit | None | Local submitted, manager notified |
| Local submitted | Approve | Create scheduled AU leave once | Approved, employee notified |
| Local submitted | Decline with reason | None | Declined, employee notified |
| Local submitted | Withdraw | None | Withdrawn, manager notified |
| Imported requested | Approve or decline | Approve or reject existing ID | Approved or declined |
| Remote submitted or approved | Withdraw | Reject existing ID where Xero allows it | Withdrawn; if Xero refuses, stays approved with a plain-language error |
| Approval create failed definitively | Explicit retry | New fenced create attempt | Provider outcome decides |
| Approval create uncertain, or accepted but not persisted | Any retry, edit or withdraw | None | Administrator recovery required |
| Exact verified recovery candidate | Attach | Read only | Provider state attached, original actor kept |
| Independently proved not created | Record evidence | None | Explicit retry allowed |
| Legacy app-submitted remote record | Approve or decline | None | Scoped administrator review required |

Open question: Xero documents `reject` for requested leave. Whether it accepts scheduled leave created by approval is unverified. Plan 160 Step 4 row 7 observes it.

## Schema

Migration `20261002000000_approval_create_operation` adds the `approve` value to the outbound operation action enum. It adds an enum value only, with no backfill, and is applied to live Neon. Existing `submit` recovery still works. Two unresolved actions on one record fail closed.

## Provider basis

Xero AU leave applications: <https://developer.xero.com/documentation/api/payrollau/leaveapplications>. API creation produces scheduled leave; approve and reject apply to requested leave. No undocumented requested status is sent. Endpoint fixture tests distinguish scheduled creation from requested import.

## Verification

Unit and integration tests cover local actions, reason enforcement, manager authorisation, legacy rows, duplicate claims, uncertain acceptance, recovery actors, withdrawal intent and concurrent approval fencing. Live provider behaviour is unverified until Plan 160 records it.
