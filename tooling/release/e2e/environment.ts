import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { parseReleaseManifest } from "../database-guard.js";

const url = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "must use HTTPS");
const schema = z.object({
  TC_API_CANDIDATE_URL: url,
  TC_APP_CANDIDATE_URL: url,
  TC_DEPLOYED_CANDIDATE_SHA: z.string().regex(/^[0-9a-f]{7,40}$/),
  TC_E2E_FIXTURE_MANIFEST: z.string().min(1),
  TC_RELEASE_MANIFEST: z.string().min(1),
  TC_WEB_CANDIDATE_URL: url,
});
const fixtureSchema = z.object({
  admission: z.object({
    expiredInvitationUrl: z.string().url(),
    revokedInvitationUrl: z.string().url(),
  }),
  feeds: z.object({ primary: z.string().uuid() }),
  organisations: z.object({
    foreign: z.string().uuid(),
    primary: z.string().uuid(),
  }),
  people: z.object({
    approve: z.string().uuid(),
    decline: z.string().uuid(),
    foreign: z.string().uuid(),
    recovery: z.string().uuid(),
    retry: z.string().uuid(),
    viewer: z.string().uuid(),
  }),
  records: z.object({
    approve: z.string().uuid(),
    decline: z.string().uuid(),
    recovery: z.string().uuid(),
    retry: z.string().uuid(),
  }),
  runId: z.string().uuid(),
});
export type ReleaseFixtures = z.infer<typeof fixtureSchema>;

export const roles = ["owner", "admin", "manager", "viewer"] as const;
export type ReleaseRole = (typeof roles)[number];

export function releaseEnvironment() {
  const parsed = schema.parse(process.env);
  const manifestPath = resolve(parsed.TC_RELEASE_MANIFEST);
  const fixtureManifestPath = resolve(parsed.TC_E2E_FIXTURE_MANIFEST);
  const manifest = parseReleaseManifest(
    JSON.parse(readFileSync(manifestPath, "utf8"))
  );
  const fixtures = fixtureSchema.parse(
    JSON.parse(readFileSync(fixtureManifestPath, "utf8"))
  );
  if (fixtures.runId !== manifest.runId) {
    throw new Error("Release journey fixtures do not match the protected run");
  }
  for (const organisationId of Object.values(fixtures.organisations)) {
    if (!manifest.owned.organisationIds.includes(organisationId)) {
      throw new Error(
        "Release journey fixture contains an unowned organisation ID"
      );
    }
  }
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (
    manifest.candidateSha !== sourceSha ||
    parsed.TC_DEPLOYED_CANDIDATE_SHA !== sourceSha
  ) {
    throw new Error(
      "Release browser suite refused a source, deployment or manifest SHA mismatch"
    );
  }
  const hosts = new Set(
    [
      parsed.TC_APP_CANDIDATE_URL,
      parsed.TC_API_CANDIDATE_URL,
      parsed.TC_WEB_CANDIDATE_URL,
    ].map((value) => new URL(value).host)
  );
  if (hosts.size !== 3) {
    throw new Error(
      "App, API and web must be explicit distinct candidate deployments"
    );
  }
  const authFiles = Object.fromEntries(
    roles.map((role) => [role, resolve(`tooling/release/.auth/${role}.json`)])
  ) as Record<ReleaseRole, string>;
  return {
    apiUrl: parsed.TC_API_CANDIDATE_URL,
    appUrl: parsed.TC_APP_CANDIDATE_URL,
    authFiles,
    fixtureManifestPath,
    fixtures,
    manifest,
    manifestPath,
    webUrl: parsed.TC_WEB_CANDIDATE_URL,
  };
}

export function roleEmail(role: ReleaseRole): string {
  return z
    .string()
    .email()
    .parse(process.env[`TC_E2E_${role.toUpperCase()}_EMAIL`]);
}

export function requiredFixture(name: string): string {
  return z.string().min(1).parse(process.env[name]);
}
