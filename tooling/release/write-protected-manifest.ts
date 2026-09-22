import { writeFileSync } from "node:fs";
import { parseReleaseManifest } from "./database-guard.js";

const outputFlag = process.argv.indexOf("--output");
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
const candidateFlag = process.argv.indexOf("--candidate-sha");
const candidateSha =
  candidateFlag >= 0 ? process.argv[candidateFlag + 1] : undefined;
const encoded = process.env.TC_PROTECTED_MANIFEST_BASE64;

if (!(outputPath && candidateSha && encoded)) {
  throw new Error(
    "Usage: write-protected-manifest.ts --output <path> --candidate-sha <sha> with TC_PROTECTED_MANIFEST_BASE64"
  );
}
if (!/^[0-9a-f]{40}$/.test(candidateSha)) {
  throw new Error("The protected candidate SHA must be a full Git commit SHA");
}

let decoded: unknown;
try {
  decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
} catch (error) {
  throw new Error("The protected release manifest is not valid base64 JSON", {
    cause: error,
  });
}
const manifest = parseReleaseManifest(decoded);
if (manifest.candidateSha !== candidateSha) {
  throw new Error("The protected manifest does not match the candidate SHA");
}
const supportedGlobalKeyPrefixes = [
  "fixture-namespace:",
  "plan_id:",
  "plan_key:",
  "stripe_event:",
  "credential_owner:",
  "provider_app:",
  "provider_connection:",
  "tenant_binding:",
  "oauth_attempt:",
  "cleanup_request:",
  "cleanup_attempt:",
  "shared_store_namespace:",
] as const;
if (
  manifest.owned.globalKeys.some(
    (key) =>
      !supportedGlobalKeyPrefixes.some(
        (prefix) => key.startsWith(prefix) && key.length > prefix.length
      )
  )
) {
  throw new Error("The protected manifest contains an unsupported global key");
}
if (
  new Set(manifest.owned.globalKeys).size !== manifest.owned.globalKeys.length
) {
  throw new Error("The protected manifest contains duplicate global keys");
}
writeFileSync(outputPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
