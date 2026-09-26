import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { z } from "zod";
import {
  readXeroExecutionManifest,
  requireDurableXeroRunnerAuthority,
  requireXeroRunnerContext,
} from "../xero-execution-guard.js";
import {
  dispatchXeroIntent,
  readXeroLedger,
  recordXeroIntent,
  type XeroLedgerEntry,
} from "../xero-ledger.js";
import {
  ingestXeroSubcase,
  persistXeroLayerReceipt,
  privateXeroArtefact,
} from "../xero-observations.js";
import { emptyObservation } from "../xero-report.js";
import { scenarioDefinition, XERO_SUBCASE_IDS } from "../xero-scenarios.js";
import {
  assertXeroBrowserMutationPage,
  assertXeroBrowserMutationRequest,
} from "./xero-browser-mutation-scope.js";

import { assertIndependentInitialImport } from "./xero-import-observer.js";
import {
  createVerifiedXeroPublicationProbe,
  xeroPublicationAssertionSchema,
} from "./xero-publication-probe.js";
import {
  verifyXeroReadonlyLayout,
  xeroReadonlyLayoutOptionsSchema,
} from "./xero-readonly-assertions.js";

const locatorSchema = z.strictObject({
  name: z.string().min(1).max(200),
  role: z.enum([
    "button",
    "link",
    "heading",
    "status",
    "alert",
    "textbox",
    "row",
  ]),
});
const fixtureSchema = z.strictObject({
  assertions: z.array(locatorSchema).min(1).max(20),
  clerkOrgId: z.string().min(1),
  clerkRole: z.enum(["org:owner", "org:admin", "org:manager", "org:viewer"]),
  clerkUserId: z.string().min(1),
  employeeId: z.uuid().nullable(),
  feedAssertion: xeroPublicationAssertionSchema.nullable(),
  fixtureAlias: z.string().regex(/^fixture-[a-z0-9-]+$/),
  id: z.string().refine((id) => XERO_SUBCASE_IDS.includes(id)),
  importRunIds: z.array(z.uuid()).length(3).nullable(),
  layoutAssertion: xeroReadonlyLayoutOptionsSchema
    .omit({ screenshotDirectory: true })
    .nullable(),
  layoutSurfaces: z
    .array(
      z.strictObject({
        clerkOrgId: z.string().min(1),
        fixtureAlias: z.string().regex(/^fixture-[a-z0-9-]+$/),
        kind: z.enum(["onboarding", "progress", "recovery"]),
        landmarks: xeroReadonlyLayoutOptionsSchema.shape.landmarks,
        organisationId: z.uuid(),
        path: z.string().regex(/^\/[a-zA-Z0-9/?=&._-]+$/),
      })
    )
    .length(3)
    .nullable(),
  leaveTypeId: z.uuid().nullable(),
  mutation: z
    .strictObject({
      action: z.enum([
        "create",
        "approve",
        "decline",
        "withdraw",
        "connect",
        "disconnect",
      ]),
      correlationId: z.uuid(),
      dateFrom: z.iso.date(),
      dateUntil: z.iso.date(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      locator: locatorSchema,
    })
    .nullable(),
  operationAlias: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,63}$/)
    .nullable(),
  organisationId: z.uuid(),
  path: z.string().regex(/^\/[a-zA-Z0-9/?=&._-]+$/),
  personId: z.uuid().nullable(),
  receipts: z
    .array(
      z.strictObject({
        layer: z.enum([
          "provider",
          "operation",
          "database",
          "worker",
          "cleanup",
          "controlled",
        ]),
        path: z.string(),
      })
    )
    .max(20),
  recordId: z.uuid().nullable(),
  recordType: z
    .string()
    .regex(/^[a-z_]+$/)
    .nullable(),
  scheduledDeadline: z.iso.datetime().nullable(),
  scheduledObservationPath: z.string().nullable(),
  scheduledRemoteId: z.string().nullable(),
  sessionPath: z.string(),
});
export function xeroBrowserFixture(id: string) {
  const path = process.env.TC_XERO_CASE_FIXTURES;
  if (!path) {
    return null;
  }
  const entries = z
    .array(fixtureSchema)
    .max(92)
    .parse(
      JSON.parse(
        readFileSync(
          privateXeroArtefact(path, requireXeroRunnerContext().output),
          "utf8"
        )
      )
    );
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error("Duplicate protected browser case fixtures");
  }
  return entries.find((entry) => entry.id === id) ?? null;
}
async function verifiedPage(
  browser: Browser,
  fixture: z.infer<typeof fixtureSchema>
) {
  const context = await requireDurableXeroRunnerAuthority();
  if (
    !resolve(fixture.sessionPath).startsWith(
      `${resolve("tooling/release/.auth")}/`
    )
  ) {
    throw new Error("Protected role session path is invalid");
  }
  const browserContext = await browser.newContext({
    baseURL: context.appUrl,
    recordVideo: ["X01.primary", "X02.primary"].includes(fixture.id)
      ? undefined
      : { dir: context.output, size: { height: 720, width: 1280 } },
    storageState: fixture.sessionPath,
  });
  const page = await browserContext.newPage();
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.Clerk?.user));
  const identity = await page.evaluate(() => ({
    clerkOrgId: window.Clerk?.organization?.id,
    role: window.Clerk?.user?.organizationMemberships.find(
      (membership) =>
        membership.organization.id === window.Clerk?.organization?.id
    )?.role,
    userId: window.Clerk?.user?.id,
  }));
  expect(identity).toEqual({
    clerkOrgId: fixture.clerkOrgId,
    role: fixture.clerkRole,
    userId: fixture.clerkUserId,
  });
  return { browserContext, context, page };
}
function locator(page: Page, value: z.infer<typeof locatorSchema>) {
  return page.getByRole(value.role, { exact: true, name: value.name });
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep pre-dispatch scope checks, durable intent and independent per-case assertions in their audited order.
export async function executeXeroBrowserSubcase(
  browser: Browser,
  fixture: z.infer<typeof fixtureSchema>
) {
  const definition = scenarioDefinition(fixture.id.split(".")[0] ?? "");
  const manifest = readXeroExecutionManifest(
    z.string().min(1).parse(process.env.TC_XERO_MANIFEST)
  );
  const owned = manifest.owned.find(
    (entry) =>
      entry.alias === fixture.fixtureAlias &&
      entry.clerkOrgId === fixture.clerkOrgId &&
      entry.organisationId === fixture.organisationId
  );
  if (!owned) {
    throw new Error("Browser scenario fixture is outside protected scope");
  }
  if (fixture.id.startsWith("X24.") && !fixture.feedAssertion) {
    throw new Error("Exact feed publication assertion is unavailable");
  }
  if (fixture.id.startsWith("X08.")) {
    throw new Error(
      "Fresh fenced scheduled observer is unavailable on the current platform"
    );
  }
  if (fixture.id.startsWith("X25.") && fixture.mutation !== null) {
    throw new Error("Read-only layout case cannot mutate");
  }
  const startedAt = new Date().toISOString();
  const { page, browserContext, context } = await verifiedPage(
    browser,
    fixture
  );
  let succeeded = false;
  try {
    if (fixture.id.startsWith("X25.")) {
      await browserContext.route("**/*", (route) =>
        ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
          ? route.continue()
          : route.abort("blockedbyclient")
      );
    }
    await page.goto(fixture.path);
    const publication =
      fixture.id.startsWith("X24.") && fixture.feedAssertion
        ? createVerifiedXeroPublicationProbe({
            approvedApiOrigin: manifest.deployments.api,
            assertion: fixture.feedAssertion,
            assertOwned: (_scope, privateUrl) => {
              execFileSync(
                "bun",
                [
                  "--no-env-file",
                  "--conditions=react-server",
                  "tooling/release/e2e/xero-browser-scope-cli.ts",
                  owned.alias,
                  "--feed",
                  fixture.feedAssertion?.feedId ?? "",
                ],
                {
                  env: process.env,
                  input: JSON.stringify({ privateUrl }),
                  stdio: ["pipe", "ignore", "ignore"],
                }
              );
              return Promise.resolve();
            },
            fixture: {
              alias: owned.alias,
              clerkOrgId: owned.clerkOrgId,
              feedId: fixture.feedAssertion.feedId,
              organisationId: owned.organisationId,
            },
            observationId: fixture.id,
            privateUrl: fixture.feedAssertion.privateUrl,
            request: browserContext.request,
          })
        : null;
    await publication?.observeBefore();
    if (fixture.mutation) {
      const { mutation } = fixture;
      const mutationScope = {
        action: mutation.action,
        dateFrom: mutation.dateFrom,
        dateUntil: mutation.dateUntil,
        employeeId: fixture.employeeId,
        leaveTypeId: fixture.leaveTypeId,
        organisationId: owned.organisationId,
        recordId: fixture.recordId,
      };
      assertXeroBrowserMutationPage(page.url(), context.appUrl, mutationScope);
      const actionContract = manifest.browserActions?.find(
        (contract) =>
          contract.action === mutation.action &&
          contract.candidateSha === context.candidateSha
      );
      if (!actionContract) {
        throw new Error(
          "Verified candidate browser action contract is unavailable"
        );
      }
      if (
        (fixture.employeeId !== null &&
          !owned.employeeIds.includes(fixture.employeeId)) ||
        (fixture.leaveTypeId !== null &&
          !owned.leaveTypeIds.includes(fixture.leaveTypeId))
      ) {
        throw new Error("Browser mutation payroll identity is not owned");
      }
      execFileSync(
        "bun",
        [
          "--no-env-file",
          "--conditions=react-server",
          "tooling/release/e2e/xero-browser-scope-cli.ts",
          fixture.fixtureAlias,
          ...(fixture.recordId
            ? [
                JSON.stringify({
                  employeeId: fixture.employeeId,
                  endsAt: mutation.dateUntil,
                  leaveTypeId: fixture.leaveTypeId,
                  personId: fixture.personId,
                  recordId: fixture.recordId,
                  recordType: fixture.recordType,
                  startsAt: mutation.dateFrom,
                }),
              ]
            : []),
        ],
        { env: process.env, stdio: "ignore" }
      );
      await page.route("**/*", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        try {
          if (
            new URL(route.request().url()).origin !==
              new URL(context.appUrl).origin ||
            route.request().headers()["next-action"] !==
              actionContract.nextActionId
          ) {
            throw new Error("Unknown mutation wire contract");
          }
          assertXeroBrowserMutationRequest(
            route.request().postDataJSON(),
            mutationScope
          );
          await route.continue();
        } catch {
          await route.abort("blockedbyclient");
        }
      });
      const ledgerPath = resolve(context.output, "xero-ledger.json");
      const ledger = readXeroLedger(ledgerPath, manifest);
      const entry: XeroLedgerEntry = {
        action: mutation.action,
        bindingGeneration: owned.bindingGeneration,
        cleanup: "pending",
        cleanupReference: null,
        clerkOrgId: owned.clerkOrgId,
        dateFrom: mutation.dateFrom,
        dateUntil: mutation.dateUntil,
        fingerprint: mutation.fingerprint,
        id: mutation.correlationId,
        intendedAt: startedAt,
        localId: null,
        organisationId: owned.organisationId,
        outcome: "intended",
        remoteId: null,
        updatedAt: startedAt,
      };
      recordXeroIntent(ledgerPath, ledger, entry, manifest);
      await dispatchXeroIntent(
        ledgerPath,
        ledger,
        entry.id,
        () => locator(page, mutation.locator).click(),
        () => ({ localId: null, remoteId: null }),
        manifest
      );
    }
    if (fixture.id.startsWith("X04.")) {
      if (!fixture.importRunIds) {
        throw new Error(
          "Exact initial import stage run identities are unavailable"
        );
      }
      const bytes = execFileSync(
        "bun",
        [
          "--no-env-file",
          "--conditions=react-server",
          "tooling/release/e2e/xero-import-observer-cli.ts",
          fixture.fixtureAlias,
          JSON.stringify(fixture.importRunIds),
        ],
        {
          encoding: "utf8",
          env: process.env,
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 15 * 60_000,
        }
      );
      const observed = z
        .object({ canonical: z.unknown(), raw: z.unknown() })
        .parse(JSON.parse(bytes));
      assertIndependentInitialImport(observed.raw, observed.canonical, {
        bindingGeneration: owned.bindingGeneration,
        campaignStartedAt: context.createdAt,
        clerkOrgId: owned.clerkOrgId,
        expectedRunIds: fixture.importRunIds,
        organisationId: owned.organisationId,
        xeroTenantId: owned.xeroTenantId,
      });
    }
    for (const assertion of fixture.assertions) {
      await expect(locator(page, assertion)).toBeVisible();
    }
    let actualUi: unknown = await Promise.all(
      fixture.assertions.map(async (assertion) => ({
        count: await locator(page, assertion).count(),
        role: assertion.role,
        text: await locator(page, assertion).allTextContents(),
      }))
    );
    if (fixture.id.startsWith("X24.")) {
      if (!publication) {
        throw new Error("Exact feed publication assertion is unavailable");
      }
      actualUi = await publication.observeAfter();
    }
    if (fixture.id.startsWith("X25.")) {
      if (!fixture.layoutAssertion) {
        throw new Error(
          "Actual viewport and accessibility assertion is unavailable"
        );
      }
      const suffix = fixture.id.slice(4);
      if (
        suffix !== "keyboard-status" &&
        suffix !==
          `${fixture.layoutAssertion.width}-${fixture.layoutAssertion.colourScheme}`
      ) {
        throw new Error("Viewport case differs from its assertion");
      }
      if (suffix === "keyboard-status" && !fixture.layoutAssertion.keyboard) {
        throw new Error("Keyboard status assertion is unavailable");
      }
      if (
        !fixture.layoutSurfaces ||
        new Set(fixture.layoutSurfaces.map((surface) => surface.kind)).size !==
          3
      ) {
        throw new Error("All three protected layout surfaces are unavailable");
      }
      const measurements: {
        surface: "onboarding" | "progress" | "recovery";
        result: Awaited<ReturnType<typeof verifyXeroReadonlyLayout>>;
      }[] = [];
      for (const surface of fixture.layoutSurfaces) {
        const resource = manifest.owned.find(
          (entry) =>
            entry.alias === surface.fixtureAlias &&
            entry.clerkOrgId === surface.clerkOrgId &&
            entry.organisationId === surface.organisationId
        );
        const address = new URL(surface.path, context.appUrl);
        if (
          !resource ||
          surface.clerkOrgId !== fixture.clerkOrgId ||
          address.searchParams.get("org") !== resource.organisationId ||
          !["/settings/integrations/xero", "/plans", "/calendar"].includes(
            address.pathname
          )
        ) {
          throw new Error("Read-only surface has foreign payroll scope");
        }
        execFileSync(
          "bun",
          [
            "--no-env-file",
            "--conditions=react-server",
            "tooling/release/e2e/xero-browser-scope-cli.ts",
            resource.alias,
          ],
          { env: process.env, stdio: "ignore" }
        );
        await page.goto(surface.path);
        measurements.push({
          result: await verifyXeroReadonlyLayout(page, {
            ...fixture.layoutAssertion,
            landmarks: surface.landmarks,
            screenshotDirectory: context.output,
          }),
          surface: surface.kind,
        });
      }
      actualUi = measurements;
    }
    const observedAt = new Date().toISOString();
    const uiFingerprint = createHash("sha256")
      .update(JSON.stringify(actualUi))
      .digest("hex");
    const uiPath = resolve(context.output, `${fixture.id}-ui.json`);
    persistXeroLayerReceipt(
      uiPath,
      {
        actualFingerprint: uiFingerprint,
        assertionPassed: true,
        candidateSha: context.candidateSha,
        eventAlias: null,
        expectedFingerprint: uiFingerprint,
        fixtureAlias: fixture.fixtureAlias,
        intercepted: false,
        layer: "ui",
        logicalRunAlias: null,
        mode: definition.requiredMode,
        observationId: fixture.id,
        observedAt,
        operationAlias: fixture.operationAlias,
        origin: null,
        runId: context.runId,
        schemaVersion: 1,
        terminal: "succeeded",
      },
      context.output
    );
    const endedAt = new Date().toISOString();
    const observation = {
      ...emptyObservation(fixture.id),
      actual: "assertion-passed" as const,
      attempt: 1,
      correlation: {
        fixtureAlias: fixture.fixtureAlias,
        operationAlias: fixture.operationAlias,
        runId: context.runId,
      },
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      endedAt,
      observedMode: definition.requiredMode,
      prerequisites: Object.fromEntries(
        definition.prerequisites.map((name) => [name, true])
      ),
      reason: "verified" as const,
      startedAt,
      status: "PASS" as const,
    };
    const verified = ingestXeroSubcase({
      candidateSha: context.candidateSha,
      observation,
      output: context.output,
      receipts: [...fixture.receipts, { layer: "ui", path: uiPath }],
      runId: context.runId,
    });
    writeFileSync(
      resolve(context.output, `${fixture.id}-observation.json`),
      JSON.stringify(verified),
      { flag: "wx", mode: 0o600 }
    );
    succeeded = true;
  } finally {
    const video = page.video();
    await browserContext.close();
    if (video) {
      if (succeeded) {
        await video.delete();
      } else {
        const path = await video.path();
        chmodSync(path, 0o600);
        privateXeroArtefact(path, context.output);
      }
    }
  }
}
