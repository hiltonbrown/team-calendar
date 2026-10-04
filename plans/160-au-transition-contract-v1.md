# AU transition contract v1

Contract: `au-contract-v1`. Approved on 2 October 2026. Submission stays local;
manager approval creates scheduled leave in Xero synchronously. PRODUCT.md
carries the same transition table. Live Xero behaviour remains NOT VERIFIED.

## Rules

- **Submit** is local. It validates AU eligibility, connection, employee and leave-type mapping, and working days. It creates no Xero leave and no outbound operation.
- **Approve** repeats those checks for a local request, records an outbound operation with action `approve` before sending the request, then creates scheduled AU leave in Xero synchronously.
- **Decline** (reason required) and **withdraw** of a local request make no provider call, including while disconnected.
- **Imported requested leave** uses Xero's existing approve and reject endpoints.
- Existing `submit` recovery is retained. Two unresolved actions on one record
  block further writes.
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

Xero documents `reject` for requested leave. Rejection of scheduled leave created on approval remains unverified. Plan 160 Step 4, row 7 tests this.

## Provider basis

Xero AU leave applications: <https://developer.xero.com/documentation/api/payrollau/leaveapplications>. API creation produces scheduled leave; approve and reject apply to requested leave. No undocumented requested status is sent. Endpoint fixture tests distinguish scheduled creation from requested import.

## Verification

Plan 160 must independently check the approved demo flow in Xero and replay the
protected integration suite. Both are pending. Fixture and unit tests do not
prove live provider behaviour. Do not reapply completed migrations or retry a
create with an uncertain outcome.
