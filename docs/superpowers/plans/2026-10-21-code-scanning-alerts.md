# Code Scanning Alerts Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six open CodeQL alerts on `main` (#30, #33, #36, #37, #38, #39) by fixing the one that is code-addressable and consolidating the false positives into one reviewed, dismissed location.

**Architecture:** Alert #30 is removed by deleting a redundant audience refine that `jose` already enforces exactly. Alerts #33 and #36 to #39 are heuristic false positives: CodeQL treats the `buildXeroOAuthStartUrl` result as a password because the unit tests chain start → callback, and then flags SHA-256 of the random nonce and signed state. Six inline `createHash` calls collapse into one helper, so the false positive lives on one line that is dismissed once with a recorded reason.

**Tech Stack:** TypeScript, Node `crypto`, `jose`, Zod, Vitest, GitHub CodeQL default setup, `gh` CLI.

**Spec:** GitHub code scanning alerts at `https://github.com/hiltonbrown/team-calendar/security/code-scanning` (state open, 21 October 2026) plus the SARIF taint flows from analysis `1993788154`.

## Evidence (from SARIF, analysis 1993788154)

| Alert | Rule | Location | Taint source → sink | Verdict |
|---|---|---|---|---|
| #30 | `js/incomplete-url-substring-sanitization` | `packages/xero/src/oauth/identity.ts:20` | `aud.includes(XERO_IDENTITY_AUDIENCE)` (array `includes`, exact match) | False positive, but the refine is redundant: `jwtVerify` already passes `audience: XERO_IDENTITY_AUDIENCE` (identity.ts:67). Remove it. |
| #33 | `js/insufficient-password-hash` | `service.ts:407` | test-chained state → `createHmac(...).update(encoded)` in `verifyState` | False positive: HMAC authenticates a signed state token; it is not password storage. |
| #36, #39 | same | `service.ts:880`, `:1039` | test-chained `input.state` → `createHash("sha256")` | False positive: lookup hash of a 256-bit-entropy signed token. |
| #37, #38 | same | `service.ts:878`, `:1037` | `start.value.nonce` → `createHash("sha256")` | False positive: nonce is `randomBytes(32)`; a slow KDF would add cost with no security gain. |

Every password-hash flow begins at `oauthNotConfigured()` (service.ts:629) or `buildXeroOAuthStartUrl` and passes through `service.test.ts`. Production code never links the start result to the callback inputs (that round trip goes through the browser). Earlier alerts #22, #25, #26 (false positive) and #27 (used in tests) were dismissed on the same basis. Alerts #29, #32, #34, #35 reappeared as new numbers after f8da77e0 (HKDF state key) changed the flagged lines: the HKDF change was sound but could not satisfy the heuristic. Code churn on six scattered sinks keeps regenerating alerts, which is why the plan consolidates them.

## Global Constraints

- Australian English, no em dashes in comments or commit messages.
- No behaviour change: stored `nonce_hash` and `state_hash` values stay lowercase hex SHA-256 of the UTF-8 input, so existing pending `xero_oauth_sessions` rows still match.
- Named exports only; no new barrel files.
- Verification gates: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:integration`.
- Dismissing alerts publishes a reason on GitHub. Confirm with the owner before running the dismiss commands in Task 3.

## Review Focus

1. A JWT whose `aud` is a string containing the Xero audience as a substring (`https://evil.example/?https://identity.xero.com/resources`) must be rejected. Pinned in Task 1.
2. A JWT whose `aud` is an array containing the exact Xero audience among others must still be accepted (Xero may issue multi-audience tokens). Pinned in Task 1.
3. A pending OAuth session created before deployment must still be claimable after deployment (hash output unchanged). Pinned in Task 2 by a known-vector test.
4. An array `aud` with only a superstring of the audience must be rejected. Pinned in Task 1.
5. New CodeQL analysis after merge must show no reopened alerts on the consolidated helper line other than the one deliberately dismissed. Checked in Task 3.

---

### Task 1: Remove the redundant audience refine (alert #30)

Start on a branch: `git checkout -b fix/code-scanning-alerts`.

**Files:**
- Modify: `packages/xero/src/oauth/identity.ts:14-21`
- Test: `packages/xero/src/oauth/identity.test.ts`

**Interfaces:**
- Consumes: `verifyXeroAccessTokenIdentity`, `XERO_IDENTITY_AUDIENCE` (unchanged).
- Produces: nothing new.

- [ ] **Step 1: Add audience regression tests**

Extend the existing `it.each` rejection table with:

```typescript
{ aud: "https://evil.example/?https://identity.xero.com/resources" },
{ aud: ["https://identity.xero.com/resources.evil.example"] },
```

Add one acceptance test:

```typescript
it("accepts an audience array containing the exact Xero audience", async () => {
  const signed = await token({ aud: ["https://other.example", XERO_IDENTITY_AUDIENCE] });
  expect((await verifyXeroAccessTokenIdentity(signed, deps())).ok).toBe(true);
});
```

- [ ] **Step 2: Run the tests; expect PASS before the change**

Run: `bunx vitest run packages/xero/src/oauth/identity.test.ts`
Expected: PASS (they pin current behaviour, so the removal in Step 3 is proven safe).

- [ ] **Step 3: Delete the `aud` key from `claimsSchema`**

`aud` is not read from `claims.data`; `jwtVerify` enforces the audience exactly. Zod strips unknown keys by default, so no other change is needed.

- [ ] **Step 4: Rerun the tests**

Run: `bunx vitest run packages/xero/src/oauth/identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/xero/src/oauth/identity.ts packages/xero/src/oauth/identity.test.ts
git commit -m "fix(xero): rely on jose for access token audience verification"
```

### Task 2: Consolidate OAuth session token hashing (alerts #36 to #39)

**Files:**
- Create: `packages/xero/src/oauth/session-token-hash.ts`
- Create: `packages/xero/src/oauth/session-token-hash.test.ts`
- Modify: `packages/xero/src/oauth/service.ts:664,684,878,880,1037,1039` (and drop the `createHash` import if unused)

**Interfaces:**
- Produces: `export function hashOAuthSessionToken(token: string): string` returning lowercase hex SHA-256.

- [ ] **Step 1: Write the failing test**

```typescript
it("hashes with SHA-256 hex so existing session rows still match", () => {
  expect(hashOAuthSessionToken("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});
```

- [ ] **Step 2: Run it; expect FAIL (module not found)**

Run: `bunx vitest run packages/xero/src/oauth/session-token-hash.test.ts`

- [ ] **Step 3: Implement `hashOAuthSessionToken`**

One `createHash("sha256").update(token).digest("hex")` call. Comment (one or two lines): inputs are a 32-byte random nonce or an HMAC-signed state, never a user password, so a fast lookup hash is the intended primitive. Replace all six inline calls in `service.ts`.

- [ ] **Step 4: Run the OAuth tests**

Run: `bunx vitest run packages/xero/src/oauth/`
Expected: PASS, including `service.test.ts` start → callback flows.

- [ ] **Step 5: Run gates**

Run: `bun run check && bun run typecheck && bun run test && bun run test:integration`
Expected: all PASS. Record any gate that cannot run locally as NOT VERIFIED.

- [ ] **Step 6: Commit, push the branch and open a PR**

```bash
git add packages/xero/src/oauth/session-token-hash.ts packages/xero/src/oauth/session-token-hash.test.ts packages/xero/src/oauth/service.ts
git commit -m "refactor(xero): hash OAuth session tokens through one helper"
```

### Task 3: Dismiss the remaining false positives after the PR analysis

Requires owner confirmation (publishes dismissal reasons on GitHub).

- [ ] **Step 1: Read the PR's CodeQL result**

Run: `gh api "repos/hiltonbrown/team-calendar/code-scanning/alerts?ref=refs/pull/<PR>/merge&state=open" --jq '.[] | [.number,.rule.id,.most_recent_instance.location.path,.most_recent_instance.location.start_line] | @tsv'`
Expected: #30 gone; password-hash alerts only at `session-token-hash.ts` and `service.ts` `verifyState` HMAC line.

- [ ] **Step 2: Merge, then dismiss each remaining password-hash alert on `main`**

```bash
gh api -X PATCH repos/hiltonbrown/team-calendar/code-scanning/alerts/<N> \
  -f state=dismissed -f dismissed_reason="false positive" \
  -f dismissed_comment="Input is a 32-byte random OAuth nonce or HMAC-signed state token, not a password. SHA-256/HMAC is the correct primitive; taint path is stitched by unit tests."
```

- [ ] **Step 3: Confirm zero open alerts**

Run: `gh api -X GET repos/hiltonbrown/team-calendar/code-scanning/alerts -f state=open --jq length`
Expected: `0`.

## Out of scope

- Switching CodeQL from default to advanced setup to exclude test files. It would remove the test-stitched flows but adds a workflow and config to maintain; revisit only if these alerts keep regenerating after consolidation.
- Already dismissed alerts #22, #25 to #28.
