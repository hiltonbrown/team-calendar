import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { releaseEnvironment } from "./environment.js";

const entrySchema = z.object({
  action: z.string().min(1),
  correlationId: z.string().uuid(),
  intendedAt: z.string().datetime(),
  returnedId: z.string().min(1).optional(),
  state: z.enum(["intended", "reconciled", "returned"]),
});
const ledgerSchema = z.object({
  entries: z.array(entrySchema),
  runId: z.string().uuid(),
});
const environment = releaseEnvironment();
const ledgerPath = resolve(
  `tooling/release/.auth/journey-${environment.manifest.runId}.json`
);

function readLedger(): z.infer<typeof ledgerSchema> {
  try {
    return ledgerSchema.parse(JSON.parse(readFileSync(ledgerPath, "utf8")));
  } catch {
    return { entries: [], runId: environment.manifest.runId };
  }
}

function save(ledger: z.infer<typeof ledgerSchema>) {
  writeFileSync(ledgerPath, `${JSON.stringify(ledger)}\n`, { mode: 0o600 });
}

export function recordIntendedCreate(action: string, correlationId: string) {
  const ledger = readLedger();
  ledger.entries.push({
    action,
    correlationId,
    intendedAt: new Date().toISOString(),
    state: "intended",
  });
  save(ledger);
}

export function persistReturnedId(correlationId: string, returnedId: string) {
  const ledger = readLedger();
  const entry = ledger.entries.find(
    (candidate) => candidate.correlationId === correlationId
  );
  if (!entry) {
    throw new Error("Cannot persist an unrecorded release create");
  }
  entry.returnedId = returnedId;
  entry.state = "returned";
  save(ledger);
}

export function reconcileCreate(correlationId: string) {
  const ledger = readLedger();
  const entry = ledger.entries.find(
    (candidate) => candidate.correlationId === correlationId
  );
  if (!entry?.returnedId) {
    throw new Error("Release create cannot reconcile without a returned ID");
  }
  entry.state = "reconciled";
  save(ledger);
}

export function assertJourneyLedgerReconciled() {
  const pending = readLedger().entries.filter(
    (entry) => entry.state !== "reconciled"
  );
  if (pending.length) {
    throw new Error(
      `Release journey ledger has ${pending.length} unreconciled creates`
    );
  }
}
