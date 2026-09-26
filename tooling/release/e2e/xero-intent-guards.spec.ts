import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import {
  readXeroExecutionManifest,
  requireDurableXeroRunnerAuthority,
} from "../xero-execution-guard.js";

import {
  dispatchXeroIntent,
  readXeroLedger,
  recordXeroIntent,
  type XeroLedgerEntry,
} from "../xero-ledger.js";

const fingerprintFormat = /^[a-f0-9]{64}$/;
const fixtureSchema = z.strictObject({
  case: z.enum(["wrong-file", "two-sessions", "expiry", "replay", "tamper"]),
  clerkOrgId: z.string().min(1),
  expectedMessage: z.string().min(1),
  fixtureAlias: z.string().regex(/^fixture-[a-z0-9-]+$/),
  organisationId: z.uuid(),
  secondSessionId: z.uuid().nullable(),
  sessionId: z.uuid(),
  storageState: z.string(),
  tamperOrganisationId: z.uuid().nullable(),
  wrongTenantName: z.string().min(1).nullable(),
});
function snapshot(alias: string) {
  const bytes = execFileSync(
    "bun",
    ["--no-env-file", "tooling/release/e2e/xero-browser-scope-cli.ts", alias],
    { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "ignore"] }
  );
  return z
    .strictObject({
      fingerprint: z.string().regex(fingerprintFormat),
      jobCount: z.number().int(),
      observedAt: z.iso.datetime(),
    })
    .parse(JSON.parse(bytes));
}
for (const name of [
  "wrong-file",
  "two-sessions",
  "expiry",
  "replay",
  "tamper",
]) {
  test(`161-01/161-04 intent guard: ${name}`, async ({ browser }) => {
    const fixturePath = process.env.TC_XERO_INTENT_FIXTURES;
    test.skip(
      !fixturePath,
      "Protected controlled OAuth session fixtures are unavailable"
    );
    if (!fixturePath) {
      return;
    }
    const fixtures = z
      .array(fixtureSchema)
      .length(5)
      .parse(JSON.parse(readFileSync(fixturePath, "utf8")));
    const fixture = fixtures.find((entry) => entry.case === name);
    if (!fixture) {
      throw new Error("Missing controlled intent fixture");
    }
    const context = await requireDurableXeroRunnerAuthority();
    const manifest = readXeroExecutionManifest(
      z.string().min(1).parse(process.env.TC_XERO_MANIFEST)
    );
    if (
      !(
        manifest.owned.some(
          (candidate) =>
            candidate.alias === fixture.fixtureAlias &&
            candidate.clerkOrgId === fixture.clerkOrgId &&
            candidate.organisationId === fixture.organisationId
        ) &&
        resolve(fixture.storageState).startsWith(
          `${resolve("tooling/release/.auth")}/`
        )
      )
    ) {
      throw new Error("Intent fixture has foreign scope");
    }
    const before = snapshot(fixture.fixtureAlias);
    const browserContext = await browser.newContext({
      baseURL: context.appUrl,
      storageState: fixture.storageState,
    });
    try {
      const page = await browserContext.newPage();
      await page.goto("/");
      const orgId = await page.evaluate(() => window.Clerk?.organization?.id);
      expect(orgId).toBe(fixture.clerkOrgId);
      const path = `/settings/integrations/xero/connect?session=${fixture.sessionId}`;
      await page.goto(path);
      const guardedComplete = async () => {
        const owned = manifest.owned.find(
          (candidate) =>
            candidate.alias === fixture.fixtureAlias &&
            candidate.clerkOrgId === fixture.clerkOrgId &&
            candidate.organisationId === fixture.organisationId
        );
        if (!owned) {
          throw new Error("Intent scope is not owned");
        }
        const ledgerPath = resolve(context.output, "xero-ledger.json");
        const ledger = readXeroLedger(ledgerPath, manifest);
        const now = new Date().toISOString();
        const entry: XeroLedgerEntry = {
          action: "connect",
          bindingGeneration: owned.bindingGeneration,
          cleanup: "pending",
          cleanupReference: null,
          clerkOrgId: owned.clerkOrgId,
          dateFrom: manifest.dateWindow.from,
          dateUntil: manifest.dateWindow.until,
          fingerprint: createHash("sha256")
            .update(`${fixture.case}:${fixture.sessionId}`)
            .digest("hex"),
          id: randomUUID(),
          intendedAt: now,
          localId: null,
          organisationId: owned.organisationId,
          outcome: "intended",
          remoteId: null,
          updatedAt: now,
        };
        recordXeroIntent(ledgerPath, ledger, entry, manifest);
        await dispatchXeroIntent(
          ledgerPath,
          ledger,
          entry.id,
          () =>
            page
              .getByRole("button", { exact: true, name: "Complete connection" })
              .click(),
          () => ({ localId: null, remoteId: null }),
          manifest
        );
      };
      if (name === "tamper") {
        const alternate = manifest.owned.find(
          (entry) =>
            entry.organisationId === fixture.tamperOrganisationId &&
            entry.clerkOrgId === fixture.clerkOrgId &&
            entry.organisationId !== fixture.organisationId
        );
        const contract = manifest.browserActions?.find(
          (entry) =>
            entry.action === "connect" &&
            entry.candidateSha === context.candidateSha
        );
        if (!(alternate && contract)) {
          throw new Error(
            "Controlled owned tamper target or action contract is unavailable"
          );
        }
        await page.route("**/*", (route) => {
          if (route.request().method() !== "POST") {
            return route.continue();
          }
          if (
            new URL(route.request().url()).origin !==
              new URL(context.appUrl).origin ||
            route.request().headers()["next-action"] !== contract.nextActionId
          ) {
            return route.abort("blockedbyclient");
          }
          const envelope = z
            .array(
              z.strictObject({
                organisationId: z.uuid().optional(),
                sessionId: z.uuid(),
                tenantId: z.string().min(1),
              })
            )
            .length(1)
            .parse(route.request().postDataJSON());
          const [payload] = envelope;
          if (
            !payload ||
            payload.sessionId !== fixture.sessionId ||
            payload.organisationId !== fixture.organisationId
          ) {
            return route.abort("blockedbyclient");
          }
          return route.continue({
            postData: JSON.stringify([
              { ...payload, organisationId: alternate.organisationId },
            ]),
          });
        });
        const alternateBefore = snapshot(alternate.alias);
        await guardedComplete();
        await expect(
          page.getByText(fixture.expectedMessage, { exact: false })
        ).toBeVisible();
        expect(snapshot(alternate.alias).fingerprint).toBe(
          alternateBefore.fingerprint
        );
      }
      if (name === "wrong-file") {
        if (!fixture.wrongTenantName) {
          throw new Error("Wrong-file fixture is missing an alternate file");
        }
        await page
          .getByRole("button")
          .filter({ hasText: fixture.wrongTenantName })
          .click();
        await guardedComplete();
        await expect(
          page.getByText(fixture.expectedMessage, { exact: false })
        ).toBeVisible();
      } else if (name === "two-sessions") {
        if (!fixture.secondSessionId) {
          throw new Error("Second intended session is missing");
        }
        await page.goto(
          `/settings/integrations/xero/connect?session=${fixture.secondSessionId}`
        );
        await expect(
          page.getByText(fixture.expectedMessage, { exact: false })
        ).toBeVisible();
      } else if (name !== "tamper") {
        await expect(
          page.getByText(fixture.expectedMessage, { exact: false })
        ).toBeVisible();
      }
      const after = snapshot(fixture.fixtureAlias);
      expect(after.fingerprint).toBe(before.fingerprint);
      expect(after.jobCount).toBe(before.jobCount);
    } finally {
      await browserContext.close();
    }
  });
}
