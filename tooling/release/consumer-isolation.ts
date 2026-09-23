import { z } from "zod";
import type { ReleaseManifest } from "./database-guard.js";

const MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30 * 1000;
const pageSchema = z.object({
  hasMore: z.literal(false).optional(),
  limit: z.number().int().positive(),
});
const envelopeSchema = z.object({
  data: z.array(z.unknown()).default([]),
  metadata: z.object({
    fetchedAt: z.string().datetime(),
    timeRange: z
      .object({
        from: z.string().datetime(),
        until: z.string().datetime(),
      })
      .optional(),
  }),
  page: pageSchema,
});
const environmentSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string(),
  name: z.literal("production"),
});

const assertFresh = (timestamp: string, now: number) => {
  const age = now - Date.parse(timestamp);
  if (age < -MAX_CLOCK_SKEW_MS || age > MAX_EVIDENCE_AGE_MS) {
    throw new Error("Consumer isolation evidence is stale or future-dated");
  }
};

/** Revalidate the special case where production has never registered workers. */
export const assertConsumerIsolationReadBack = async (
  manifest: ReleaseManifest,
  input: { signingKey?: string }
): Promise<void> => {
  const evidence = manifest.consumerIsolation;
  if (!evidence) {
    return;
  }
  assertFresh(evidence.observedAt, Date.now());
  if (!input.signingKey?.startsWith("signkey-prod-")) {
    throw new Error(
      "Production Inngest signing key is required for consumer isolation"
    );
  }
  const request = async (path: string) => {
    const response = await fetch(`https://api.inngest.com/v2/${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${input.signingKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(
        `Inngest consumer isolation read-back failed (${response.status})`
      );
    }
    const envelope = envelopeSchema.parse(await response.json());
    assertFresh(envelope.metadata.fetchedAt, Date.now());
    return envelope;
  };
  const environments = await request("envs?limit=100");
  if (environments.data.length !== 1) {
    throw new Error(
      "Consumer isolation requires exactly one production environment"
    );
  }
  const environment = environmentSchema.parse(environments.data[0]);
  if (environment.id !== evidence.environmentId) {
    throw new Error(
      "Inngest environment does not match protected consumer evidence"
    );
  }
  for (const path of ["apps?limit=100", "apps?limit=100&archived=true"]) {
    const apps = await request(path);
    if (apps.data.length !== 0) {
      throw new Error(
        "Consumer isolation requires zero active and archived Inngest apps"
      );
    }
  }
  const runs = await request(
    "runs?limit=100&status=RUNNING&status=QUEUED&status=PAUSED"
  );
  const range = runs.metadata.timeRange;
  if (!range) {
    throw new Error("Inngest non-terminal run inventory has no time range");
  }
  assertFresh(range.until, Date.now());
  if (runs.data.length !== 0) {
    throw new Error(
      "Consumer isolation requires zero running, queued or paused Inngest runs"
    );
  }
};
