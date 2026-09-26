import { createHash, randomUUID } from "node:crypto";
import { lstatSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { z } from "zod";

const compactDate = /^(?:\d{8}|\d{8}T\d{6}Z)$/;
const safeHash = /^[a-f0-9]{64}$/;
const eventSchema = z.strictObject({
  allDay: z.boolean(),
  description: z.string().max(20_000).nullable(),
  end: z.string().regex(compactDate),
  location: z.string().max(2000).nullable(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  start: z.string().regex(compactDate),
  summary: z.string().max(2000),
  uid: z.string().min(1).max(256),
});
const expectationSchema = z.strictObject({
  absentUids: z.array(z.string().min(1).max(256)).max(1000),
  events: z.array(eventSchema).max(1000),
  forbiddenText: z.array(z.string().min(1).max(2000)).max(100),
  transitions: z
    .array(
      z.strictObject({
        kind: z.enum(["unchanged", "material-change", "withdrawal"]),
        uid: z.string().min(1).max(256),
      })
    )
    .max(1000),
});
export type XeroFeedPublicationExpectation = z.infer<typeof expectationSchema>;
const observationSchema = z.strictObject({
  eventCount: z.number().int().nonnegative(),
  events: z
    .array(
      z.strictObject({
        representationHash: z.string().regex(safeHash),
        sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        uidHash: z.string().regex(safeHash),
      })
    )
    .max(1000),
  fingerprint: z.string().regex(safeHash),
  observedAt: z.iso.datetime(),
});
export type XeroFeedPublicationObservation = z.infer<typeof observationSchema>;
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function checked<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(message);
  }
  return parsed.data;
}
function text(value: string) {
  return value.replace(/\\([nN,;\\])/g, (_match, escaped: string) =>
    escaped.toLowerCase() === "n" ? "\n" : escaped
  );
}
function validDate(value: string, allDay: boolean) {
  if (!compactDate.test(value) || allDay !== (value.length === 8)) {
    throw new Error("Feed date format is invalid");
  }
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${allDay ? "00:00:00" : `${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`}Z`;
  const date = new Date(iso);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== iso.slice(0, 19)
  ) {
    throw new Error("Feed date is invalid");
  }
}
const sequenceFormat = /^(?:0|[1-9]\d*)$/;
const propertyFormat = /^[A-Z][A-Z0-9-]*$/;
const feedPathFormat = /^\/ical\/[A-Za-z0-9._~-]+\.ics$/;
const calendarContentType = /^text\/calendar(?:;|$)/i;
type Properties = Map<string, { value: string; parameters: string }>;
function parseProperty(line: string) {
  const colon = line.indexOf(":");
  if (colon <= 0) {
    throw new Error("Feed property is invalid");
  }
  const header = line.slice(0, colon);
  const name = header.split(";")[0] ?? "";
  if (!propertyFormat.test(name)) {
    throw new Error("Feed property is invalid");
  }
  return {
    name,
    parameters: header.slice(name.length),
    value: line.slice(colon + 1),
  };
}
function parseEvent(properties: Properties) {
  const required = (name: string) => {
    const value = properties.get(name);
    if (!value) {
      throw new Error("Feed event is incomplete");
    }
    return value;
  };
  const start = required("DTSTART");
  const end = required("DTEND");
  const allDay = start.parameters === ";VALUE=DATE";
  if (
    start.parameters !== (allDay ? ";VALUE=DATE" : "") ||
    end.parameters !== start.parameters
  ) {
    throw new Error("Feed date parameters are invalid");
  }
  const sequence = required("SEQUENCE").value;
  if (!sequenceFormat.test(sequence)) {
    throw new Error("Feed sequence is invalid");
  }
  const event = checked(
    eventSchema,
    {
      allDay,
      description: properties.has("DESCRIPTION")
        ? text(required("DESCRIPTION").value)
        : null,
      end: end.value,
      location: properties.has("LOCATION")
        ? text(required("LOCATION").value)
        : null,
      sequence: Number(sequence),
      start: start.value,
      summary: text(required("SUMMARY").value),
      uid: text(required("UID").value),
    },
    "Feed event is invalid"
  );
  validDate(event.start, event.allDay);
  validDate(event.end, event.allDay);
  if (event.end <= event.start) {
    throw new Error("Feed date range is invalid");
  }
  return event;
}
interface FeedComponents {
  disclosed: string[];
  events: z.infer<typeof eventSchema>[];
  properties: Properties | null;
  version: boolean;
}
function consumeProperty(state: FeedComponents, line: string) {
  if (line.startsWith("BEGIN:") || line.startsWith("END:")) {
    throw new Error("Feed component is unsupported");
  }
  const property = parseProperty(line);
  state.disclosed.push(text(line));
  if (state.properties) {
    if (state.properties.has(property.name)) {
      throw new Error("Feed event property is duplicated");
    }
    state.properties.set(property.name, property);
  } else if (property.name === "VERSION") {
    if (state.version || property.value !== "2.0") {
      throw new Error("Feed version is invalid");
    }
    state.version = true;
  }
}
function consumeComponent(state: FeedComponents, line: string) {
  if (line === "BEGIN:VEVENT") {
    if (state.properties !== null) {
      throw new Error("Feed components are invalid");
    }
    state.properties = new Map();
  } else if (line === "END:VEVENT") {
    if (!state.properties) {
      throw new Error("Feed components are invalid");
    }
    state.events.push(parseEvent(state.properties));
    state.properties = null;
  } else {
    consumeProperty(state, line);
  }
}
function parseComponents(lines: string[]) {
  const state: FeedComponents = {
    disclosed: [],
    events: [],
    properties: null,
    version: false,
  };
  for (const line of lines) {
    consumeComponent(state, line);
  }
  if (state.properties || !state.version) {
    throw new Error("Feed events are incomplete");
  }
  return { disclosed: state.disclosed, events: state.events };
}
function parseFeed(body: string) {
  if (
    typeof body !== "string" ||
    Buffer.byteLength(body) > 5_000_000 ||
    body.includes("\0")
  ) {
    throw new Error("Feed body is invalid");
  }
  const lines = body
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  while (lines.at(-1) === "") {
    lines.pop();
  }
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") {
    throw new Error("Feed calendar is incomplete");
  }
  const parsed = parseComponents(lines.slice(1, -1));
  if (
    new Set(parsed.events.map((event) => event.uid)).size !==
      parsed.events.length ||
    parsed.events.length > 1000
  ) {
    throw new Error("Feed events are incomplete or duplicated");
  }
  return parsed;
}
function representation(event: z.infer<typeof eventSchema>) {
  const { uid: _uid, sequence: _sequence, ...content } = event;
  return hash(JSON.stringify(content));
}
/** Independent ICS oracle. Only hashes and sequence numbers leave this helper. */
export function assertXeroFeedPublication(
  input: { body: string; expected: XeroFeedPublicationExpectation },
  previous?: XeroFeedPublicationObservation
): XeroFeedPublicationObservation {
  const expected = checked(
    expectationSchema,
    input.expected,
    "Feed expectation is invalid"
  );
  if (
    new Set(expected.events.map((event) => event.uid)).size !==
      expected.events.length ||
    new Set(expected.transitions.map((entry) => entry.uid)).size !==
      expected.transitions.length
  ) {
    throw new Error("Feed expectation is duplicated");
  }
  const actual = parseFeed(input.body);
  if (
    expected.forbiddenText.some((privateText) =>
      actual.disclosed.some((value) =>
        value.toLowerCase().includes(privateText.toLowerCase())
      )
    )
  ) {
    throw new Error("Feed privacy assertion failed");
  }
  const ordered = (events: z.infer<typeof eventSchema>[]) =>
    [...events].sort((left, right) => left.uid.localeCompare(right.uid));
  if (
    JSON.stringify(ordered(actual.events)) !==
      JSON.stringify(ordered(expected.events)) ||
    expected.absentUids.some((uid) =>
      actual.events.some((event) => event.uid === uid)
    )
  ) {
    throw new Error("Feed eligible content assertion failed");
  }
  const observation = {
    eventCount: actual.events.length,
    events: actual.events.map((event) => ({
      representationHash: representation(event),
      sequence: event.sequence,
      uidHash: hash(event.uid),
    })),
    fingerprint: hash(JSON.stringify(ordered(actual.events))),
    observedAt: new Date().toISOString(),
  };
  assertFeedTransitions(observation, expected, previous);
  return observation;
}
function assertFeedTransitions(
  observation: XeroFeedPublicationObservation,
  expected: XeroFeedPublicationExpectation,
  previous?: XeroFeedPublicationObservation
) {
  if (expected.transitions.length && !previous) {
    throw new Error("Feed transition has no independent baseline");
  }
  const baseline = previous
    ? checked(observationSchema, previous, "Feed baseline is invalid")
    : null;
  for (const transition of expected.transitions) {
    const before =
      baseline?.events.filter(
        (event) => event.uidHash === hash(transition.uid)
      ) ?? [];
    const after = observation.events.find(
      (event) => event.uidHash === hash(transition.uid)
    );
    const [prior] = before;
    if (before.length !== 1 || !prior) {
      throw new Error("Feed transition baseline is missing or duplicated");
    }
    if (transition.kind === "withdrawal") {
      if (after) {
        throw new Error("Withdrawn feed event remains published");
      }
    } else if (
      !after ||
      (transition.kind === "unchanged" &&
        (after.representationHash !== prior.representationHash ||
          after.sequence !== prior.sequence)) ||
      (transition.kind === "material-change" &&
        (after.representationHash === prior.representationHash ||
          after.sequence !== prior.sequence + 1))
    ) {
      throw new Error("Feed stable UID or sequence assertion failed");
    }
  }
}
const fixtureSchema = z.strictObject({
  alias: z.string().regex(/^fixture-[a-z0-9-]+$/),
  clerkOrgId: z.string().min(1),
  feedId: z.uuid(),
  organisationId: z.uuid(),
});
export type XeroReadonlyFeedFixture = z.infer<typeof fixtureSchema>;
export async function fetchAndAssertXeroFeedPublication(input: {
  request: {
    get: (
      url: string,
      options: NonNullable<Parameters<APIRequestContext["get"]>[1]>
    ) => Promise<
      Pick<
        Awaited<ReturnType<APIRequestContext["get"]>>,
        "status" | "url" | "headers" | "text"
      >
    >;
  };
  privateUrl: string;
  approvedApiOrigin: string;
  fixture: XeroReadonlyFeedFixture;
  expected: XeroFeedPublicationExpectation;
  previous?: XeroFeedPublicationObservation;
  assertOwned: (
    fixture: Readonly<XeroReadonlyFeedFixture>,
    privateUrl: string
  ) => Promise<void>;
}) {
  const fixture = checked(
    fixtureSchema,
    input.fixture,
    "Feed fixture is invalid"
  );
  try {
    const approved = new URL(input.approvedApiOrigin);
    const address = new URL(input.privateUrl);
    if (
      approved.protocol !== "https:" ||
      approved.origin !== input.approvedApiOrigin ||
      approved.username ||
      approved.password ||
      address.origin !== approved.origin ||
      address.username ||
      address.password ||
      address.search ||
      address.hash ||
      !feedPathFormat.test(address.pathname)
    ) {
      throw new Error("Invalid address");
    }
  } catch {
    // biome-ignore lint/style/useErrorCause: Original errors may contain private capability URLs.
    throw new Error("Authorised feed address is invalid");
  }
  try {
    await input.assertOwned(fixture, input.privateUrl);
  } catch {
    // biome-ignore lint/style/useErrorCause: Original errors may contain private capability URLs.
    throw new Error("Authorised feed ownership is unverified");
  }
  let body: string;
  try {
    const response = await input.request.get(input.privateUrl, {
      failOnStatusCode: false,
      maxRedirects: 0,
      timeout: 30_000,
    });
    if (
      response.status() !== 200 ||
      response.url() !== input.privateUrl ||
      !calendarContentType.test(response.headers()["content-type"] ?? "")
    ) {
      throw new Error("Invalid response");
    }
    body = await response.text();
  } catch {
    // biome-ignore lint/style/useErrorCause: Original errors may contain private capability URLs.
    throw new Error("Authorised feed retrieval failed");
  }
  return assertXeroFeedPublication(
    { body, expected: input.expected },
    input.previous
  );
}

const locatorSchema = z.strictObject({
  name: z.string().min(1).max(200),
  role: z.enum([
    "heading",
    "main",
    "region",
    "status",
    "alert",
    "button",
    "link",
    "textbox",
  ]),
});
const layoutSchema = z.strictObject({
  colourScheme: z.enum(["light", "dark"]),
  height: z.number().int().min(600).max(1440),
  keyboard: z
    .strictObject({
      focus: locatorSchema,
      maxTabs: z.number().int().min(1).max(40),
      statusText: z.string().min(1).max(500),
      timeoutMs: z.number().int().min(100).max(30_000),
    })
    .optional(),
  landmarks: z.array(locatorSchema).min(1).max(20),
  screenshotDirectory: z.string().min(1),
  width: z.union([z.literal(390), z.literal(768), z.literal(1440)]),
});
export type XeroReadonlyLayoutOptions = z.infer<typeof layoutSchema>;
const factsSchema = z.strictObject({
  backgroundLuminance: z.number().min(0).max(1),
  blockedMutations: z.number().int().nonnegative(),
  computedTheme: z.string(),
  keyboard: z
    .strictObject({
      announcementChanged: z.boolean(),
      focused: z.boolean(),
      focusVisible: z.boolean(),
      ringWidth: z.number(),
    })
    .nullable(),
  landmarks: z.array(
    z.strictObject({
      left: z.number(),
      right: z.number(),
      visible: z.boolean(),
    })
  ),
  scrollWidth: z.number(),
  viewportHeight: z.number(),
  viewportWidth: z.number(),
});
export type XeroReadonlyLayoutFacts = z.infer<typeof factsSchema>;
export function assertXeroReadonlyLayoutFacts(
  value: XeroReadonlyLayoutFacts,
  expected: Pick<
    XeroReadonlyLayoutOptions,
    "width" | "height" | "colourScheme"
  > & { keyboardRequired: boolean; landmarkCount: number }
) {
  const facts = checked(
    factsSchema,
    value,
    "Read-only browser observations are invalid"
  );
  if (
    facts.viewportWidth !== expected.width ||
    facts.viewportHeight !== expected.height ||
    facts.scrollWidth > expected.width + 1 ||
    facts.computedTheme !== expected.colourScheme ||
    (expected.colourScheme === "dark"
      ? facts.backgroundLuminance >= 0.4
      : facts.backgroundLuminance <= 0.6) ||
    facts.landmarks.length !== expected.landmarkCount ||
    facts.landmarks.some(
      (entry) =>
        !entry.visible || entry.left < -1 || entry.right > expected.width + 1
    )
  ) {
    throw new Error("Read-only viewport, theme or layout assertion failed");
  }
  if (facts.blockedMutations !== 0) {
    throw new Error("Read-only browser attempted a mutation");
  }
  if (
    expected.keyboardRequired &&
    (!(facts.keyboard?.focused && facts.keyboard.focusVisible) ||
      facts.keyboard.ringWidth < 3 ||
      !facts.keyboard.announcementChanged)
  ) {
    throw new Error("Read-only keyboard or live announcement assertion failed");
  }
  return hash(JSON.stringify(facts));
}
function privateScreenshotDirectory(path: string) {
  const root = resolve("tooling/release/test-results");
  const directory = resolve(path);
  if (
    !directory.startsWith(`${root}${sep}`) ||
    lstatSync(root).isSymbolicLink() ||
    lstatSync(directory).isSymbolicLink() ||
    !statSync(directory).isDirectory() ||
    statSync(directory).mode % 0o100 !== 0 ||
    !realpathSync(directory).startsWith(`${realpathSync(root)}${sep}`)
  ) {
    throw new Error("Read-only screenshot storage is not private");
  }
  let parent = root;
  for (const part of ["", ...relative(root, directory).split(sep)]) {
    parent = resolve(parent, part);
    if (
      lstatSync(parent).isSymbolicLink() ||
      !statSync(parent).isDirectory() ||
      statSync(parent).mode % 0o100 !== 0
    ) {
      throw new Error("Read-only screenshot storage is not private");
    }
  }
  return directory;
}
async function verifyKeyboard(
  page: Page,
  expected: NonNullable<XeroReadonlyLayoutOptions["keyboard"]>
): Promise<NonNullable<XeroReadonlyLayoutFacts["keyboard"]>> {
  const status = await page.evaluateHandle(() => {
    const seen: string[] = [];
    const selector =
      '[role="status"],[role="alert"],[aria-live="polite"],[aria-live="assertive"]';
    const previous = new Map(
      Array.from(document.querySelectorAll(selector), (region) => [
        region,
        (region.textContent ?? "").replace(/\s+/g, " ").trim(),
      ])
    );
    function visit(region: Element | null) {
      if (!region || region.closest('[aria-hidden="true"]')) {
        return;
      }
      const style = getComputedStyle(region);
      const current = (region.textContent ?? "").replace(/\s+/g, " ").trim();
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        previous.get(region) !== current
      ) {
        seen.push(current);
      }
      previous.set(region, current);
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element =
          mutation.target instanceof Element
            ? mutation.target
            : mutation.target.parentElement;
        if (!element) {
          continue;
        }
        visit(element.closest(selector));
        for (const region of element.querySelectorAll(selector)) {
          visit(region);
        }
      }
    });
    observer.observe(document.body, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    return { observer, seen };
  });
  try {
    const focus = page.getByRole(expected.focus.role, {
      exact: true,
      name: expected.focus.name,
    });
    if ((await focus.count()) !== 1) {
      throw new Error("Read-only focus target is absent or ambiguous");
    }
    const initialFocusStyle = await focus.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        initiallyFocused: element === document.activeElement,
        outline: style.outline,
      };
    });
    let reached = false;
    for (let tab = 0; tab < expected.maxTabs; tab += 1) {
      await page.keyboard.press("Tab");
      if (
        await focus.evaluate((element) => element === document.activeElement)
      ) {
        reached = true;
        break;
      }
    }
    const focusedBounds = await focus.boundingBox();
    const viewport = page.viewportSize();
    if (
      !((await focus.isVisible()) && focusedBounds && viewport) ||
      focusedBounds.x < 0 ||
      focusedBounds.y < 0 ||
      focusedBounds.x + focusedBounds.width > viewport.width ||
      focusedBounds.y + focusedBounds.height > viewport.height
    ) {
      throw new Error("Read-only focus target is outside the viewport");
    }
    const focusFacts = await focus.evaluate((element, initialStyle) => {
      const style = getComputedStyle(element);
      const painter = document.createElement("canvas").getContext("2d");
      if (!painter) {
        throw new Error("Focus observation is unavailable");
      }
      painter.fillStyle = style.outlineColor;
      painter.fillRect(0, 0, 1, 1);
      const opaqueOutline = (painter.getImageData(0, 0, 1, 1).data[3] ?? 0) > 0;
      const outline =
        style.outlineStyle === "none" || !opaqueOutline
          ? 0
          : Number.parseFloat(style.outlineWidth);
      // biome-ignore lint/performance/useTopLevelRegex: Browser evaluation cannot close over host expressions.
      const shadowSeparator = /,(?![^()]*\))/;
      // biome-ignore lint/performance/useTopLevelRegex: Browser evaluation cannot close over host expressions.
      const shadowColour = /^[a-z-]+\([^)]*\)/;
      function measureShadow(paint: CanvasRenderingContext2D) {
        let shadow = 0;
        for (const part of style.boxShadow.split(shadowSeparator)) {
          const value = part.trim();
          const match = shadowColour.exec(value);
          // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for none or non-colour shadows at runtime.
          if (match === null) {
            continue;
          }
          const [colour] = match;
          if (!colour) {
            continue;
          }
          const units = value.slice(colour.length).trim().split(" ");
          const spread = Number.parseFloat(units[3] ?? "0");
          paint.clearRect(0, 0, 1, 1);
          paint.fillStyle = colour;
          paint.fillRect(0, 0, 1, 1);
          if ((paint.getImageData(0, 0, 1, 1).data[3] ?? 0) > 0) {
            shadow = Math.max(shadow, spread);
          }
        }
        return shadow;
      }
      const shadow = measureShadow(painter);
      const outlineChanged =
        initialStyle.initiallyFocused || style.outline !== initialStyle.outline;
      const shadowChanged =
        initialStyle.initiallyFocused ||
        style.boxShadow !== initialStyle.boxShadow;
      return {
        focused: element === document.activeElement,
        focusVisible: element.matches(":focus-visible"),
        ringWidth: Math.max(
          outlineChanged ? outline : 0,
          shadowChanged ? shadow : 0
        ),
      };
    }, initialFocusStyle);
    const deadline = Date.now() + expected.timeoutMs;
    let changed = false;
    while (Date.now() < deadline && !changed) {
      changed = await status.evaluate(
        (state, expectedText) => state.seen.includes(expectedText),
        expected.statusText
      );
      if (!changed) {
        await page.waitForTimeout(25);
      }
    }
    return {
      ...focusFacts,
      announcementChanged: changed,
      focused: reached && focusFacts.focused,
    };
  } finally {
    await status.evaluate((state) => state.observer.disconnect());
    await status.dispose();
  }
}
/** Uses only resize, colour preference and Tab. It never activates a payroll action. */
export async function verifyXeroReadonlyLayout(
  page: Page,
  value: XeroReadonlyLayoutOptions
) {
  const options = checked(
    layoutSchema,
    value,
    "Read-only browser fixture is invalid"
  );
  const directory = privateScreenshotDirectory(options.screenshotDirectory);
  let blockedMutations = 0;
  const guard = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    if (["GET", "HEAD"].includes(route.request().method())) {
      await route.continue();
    } else {
      blockedMutations += 1;
      await route.abort("blockedbyclient");
    }
  };
  await page.route("**/*", guard);
  try {
    await page.setViewportSize({
      height: options.height,
      width: options.width,
    });
    await page.emulateMedia({ colorScheme: options.colourScheme });
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done()))
        )
    );
    const landmarks: XeroReadonlyLayoutFacts["landmarks"] = [];
    for (const item of options.landmarks) {
      const target = page.getByRole(item.role, {
        exact: true,
        name: item.name,
      });
      if ((await target.count()) !== 1) {
        throw new Error("Read-only landmark is absent or ambiguous");
      }
      const bounds = await target.boundingBox();
      landmarks.push({
        left: bounds?.x ?? -2,
        right: bounds ? bounds.x + bounds.width : options.width + 2,
        visible: await target.isVisible(),
      });
    }
    const keyboard = options.keyboard
      ? await verifyKeyboard(page, options.keyboard)
      : null;
    const layout = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const painter = canvas.getContext("2d");
      if (!painter) {
        throw new Error("Theme observation is unavailable");
      }
      painter.fillStyle = "white";
      painter.fillRect(0, 0, 1, 1);
      for (const element of [document.documentElement, document.body]) {
        painter.fillStyle = getComputedStyle(element).backgroundColor;
        painter.fillRect(0, 0, 1, 1);
      }
      const pixel = painter.getImageData(0, 0, 1, 1).data;
      return {
        backgroundLuminance:
          ((pixel[0] ?? 0) * 0.2126 +
            (pixel[1] ?? 0) * 0.7152 +
            (pixel[2] ?? 0) * 0.0722) /
          255,
        computedTheme: getComputedStyle(document.documentElement).colorScheme,
        scrollWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    const fingerprint = assertXeroReadonlyLayoutFacts(
      { ...layout, blockedMutations, keyboard, landmarks },
      {
        ...options,
        keyboardRequired: options.keyboard !== undefined,
        landmarkCount: options.landmarks.length,
      }
    );
    const screenshot = await page.screenshot({
      animations: "disabled",
      fullPage: false,
    });
    if (blockedMutations !== 0) {
      throw new Error("Read-only browser attempted a mutation");
    }
    const screenshotHash = createHash("sha256")
      .update(screenshot)
      .digest("hex");
    writeFileSync(
      resolve(directory, `readonly-${randomUUID()}.png`),
      screenshot,
      { flag: "wx", mode: 0o600 }
    );
    return {
      colourScheme: options.colourScheme,
      fingerprint,
      keyboardVerified: keyboard !== null,
      observedAt: new Date().toISOString(),
      screenshotHash,
      screenshotReference: `sanitised/${screenshotHash}.png`,
      width: options.width,
    };
  } finally {
    await page.unroute("**/*", guard);
  }
}

export {
  expectationSchema as xeroFeedPublicationExpectationSchema,
  layoutSchema as xeroReadonlyLayoutOptionsSchema,
  observationSchema as xeroFeedPublicationObservationSchema,
};
