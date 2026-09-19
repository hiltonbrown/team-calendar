import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const evidenceDirectory =
  process.env.TC_ANALYTICS_BROWSER_EVIDENCE ??
  "/tmp/teamcalendar-analytics-browser-release";
const bundleDirectory = resolve(evidenceDirectory, "bundle");
const entrySource = resolve(evidenceDirectory, "entry.ts");
const instrumentationSource = resolve(
  process.cwd(),
  "packages/analytics/instrumentation-client.ts"
);
const secrets = [
  "TEST_QUERY_SECRET",
  "TEST_FRAGMENT_SECRET",
  "TEST_TICKET_SECRET",
  "TEST_HASH_SECRET",
] as const;

await mkdir(bundleDirectory, { recursive: true });
await writeFile(
  entrySource,
  `export { groupAnalytics, identifyAnalytics, initializeAnalytics } from ${JSON.stringify(instrumentationSource)};\n`
);
execFileSync(
  process.execPath,
  [
    "--no-env-file",
    "build",
    entrySource,
    "--outdir",
    bundleDirectory,
    "--target",
    "browser",
    "--format",
    "esm",
    "--splitting",
    "--define",
    "process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID=undefined",
    "--define",
    'process.env.NEXT_PUBLIC_POSTHOG_HOST="https://analytics.invalid"',
    "--define",
    'process.env.NEXT_PUBLIC_POSTHOG_KEY="phc_release_test"',
  ],
  { cwd: process.cwd(), stdio: "inherit" }
);

const bundleFiles = await readdir(bundleDirectory);
const entryFile = bundleFiles.find((file) => file === "entry.js");
const sdkFile = bundleFiles.find((file) => file.startsWith("module-"));
if (!(entryFile && sdkFile)) {
  throw new Error(
    "Bun did not emit the expected entry and PostHog module chunk"
  );
}
const browserScript = `
import posthog from "/assets/${sdkFile}";
const originalInit = posthog.init.bind(posthog);
posthog.init = (key, options, name) => originalInit(key, { ...options, opt_out_useragent_filter: true }, name);
const analytics = await import("/assets/${entryFile}");
const initialized = analytics.initializeAnalytics();
analytics.identifyAnalytics("release-user", { role: "owner" });
analytics.groupAnalytics("organisation", "release-org", { plan: "early_access" });
history.pushState({}, "", "/next?ticket=TEST_TICKET_SECRET#TEST_HASH_SECRET");
await initialized;
`;

interface CapturedRequest {
  bodyBase64: string;
  headers: Record<string, string>;
  method: string;
  url: string;
}

const requests: CapturedRequest[] = [];
const browserErrors: string[] = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "app.test" && url.pathname.startsWith("/assets/")) {
      const file = basename(url.pathname);
      if (!bundleFiles.includes(file)) {
        await route.abort();
        return;
      }
      await route.fulfill({
        body: await readFile(resolve(bundleDirectory, file)),
        contentType: "text/javascript",
        status: 200,
      });
      return;
    }
    if (url.hostname === "app.test") {
      await route.fulfill({
        body: `<!doctype html><script type="module">${browserScript}</script>`,
        contentType: "text/html",
        status: 200,
      });
      return;
    }
    const body = request.postDataBuffer();
    requests.push({
      bodyBase64: body?.toString("base64") ?? "",
      headers: request.headers(),
      method: request.method(),
      url: request.url(),
    });
    if (request.resourceType() === "script") {
      await route.fulfill({
        body: "",
        contentType: "text/javascript",
        status: 200,
      });
      return;
    }
    await route.fulfill({
      body: url.pathname.includes("flags")
        ? JSON.stringify({ featureFlagPayloads: {}, featureFlags: {} })
        : JSON.stringify({ status: 1 }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto(
    "https://app.test/start?feed=TEST_QUERY_SECRET#TEST_FRAGMENT_SECRET"
  );
  await page.waitForTimeout(6500);
} finally {
  await browser.close();
}

const deliveries = requests.filter(
  (request) =>
    request.method === "POST" && new URL(request.url).pathname.includes("/e")
);
const envelopes = deliveries.map(decodeEnvelope);
if (envelopes.some((envelope) => envelope.api_key !== "phc_release_test")) {
  throw new Error("PostHog delivery used an unexpected API key");
}
const events = envelopes.flatMap((envelope) => envelope.batch);
const eventNames = events.map((event) => event.event);
for (const expected of ["$identify", "$groupidentify"]) {
  if (eventNames.filter((event) => event === expected).length !== 1) {
    throw new Error(`Expected exactly one ${expected} event`);
  }
}
if (eventNames.filter((event) => event === "$pageview").length !== 2) {
  throw new Error("Expected exactly two pageview events");
}
if (events.length !== 4) {
  throw new Error(`Expected four analytics events, received ${events.length}`);
}
const deliveredJson = JSON.stringify(envelopes);
if (secrets.some((secret) => deliveredJson.includes(secret))) {
  throw new Error("Analytics delivery contained a query or fragment secret");
}
if (browserErrors.length > 0) {
  throw new Error(`Browser errors: ${browserErrors.join("; ")}`);
}

await Promise.all([
  writeFile(
    resolve(evidenceDirectory, "requests.json"),
    `${JSON.stringify(requests, null, 2)}\n`
  ),
  writeFile(
    resolve(evidenceDirectory, "result.json"),
    `${JSON.stringify(
      { browserErrors, eventNames, passed: true, secretMarkersPresent: false },
      null,
      2
    )}\n`
  ),
]);
console.log(
  JSON.stringify({
    events: eventNames,
    evidence: evidenceDirectory,
    passed: true,
  })
);

function decodeEnvelope(request: CapturedRequest): {
  api_key?: string;
  batch: Array<{ event?: string; properties?: Record<string, unknown> }>;
} {
  const body = Buffer.from(request.bodyBase64, "base64");
  for (const candidate of [body, tryGunzip(body)]) {
    if (!candidate) {
      continue;
    }
    try {
      const value = JSON.parse(candidate.toString("utf8")) as ReturnType<
        typeof decodeEnvelope
      >;
      if (Array.isArray(value.batch)) {
        return value;
      }
    } catch {
      // Try the next supported transport encoding.
    }
  }
  throw new Error("Unable to decode a PostHog POST /e envelope");
}

function tryGunzip(value: Buffer): Buffer | null {
  try {
    return gunzipSync(value);
  } catch {
    return null;
  }
}
