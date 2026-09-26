import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { type Browser, chromium } from "@playwright/test";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  assertXeroFeedPublication,
  assertXeroReadonlyLayoutFacts,
  fetchAndAssertXeroFeedPublication,
  verifyXeroReadonlyLayout,
  type XeroFeedPublicationExpectation,
  type XeroReadonlyLayoutFacts,
} from "./xero-readonly-assertions.js";

const hashFormat = /^[a-f0-9]{64}$/;
const uid = "synthetic-stable@ical.teamcalendar.online";
function event(
  overrides: Partial<XeroFeedPublicationExpectation["events"][number]> = {}
) {
  return {
    allDay: true,
    description: null,
    end: "20261003",
    location: null,
    sequence: 4,
    start: "20261001",
    summary: "Out of office",
    uid,
    ...overrides,
  };
}
function expected(
  overrides: Partial<XeroFeedPublicationExpectation> = {}
): XeroFeedPublicationExpectation {
  return {
    absentUids: [],
    events: [event()],
    forbiddenText: ["Sensitive diagnosis", "jane@example.test"],
    transitions: [],
    ...overrides,
  };
}
function body(entries = [event()]) {
  const text = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Synthetic controlled fixture//EN",
    ...entries.flatMap((entry) => [
      "BEGIN:VEVENT",
      `UID:${entry.uid}`,
      `DTSTART${entry.allDay ? ";VALUE=DATE" : ""}:${entry.start}`,
      `DTEND${entry.allDay ? ";VALUE=DATE" : ""}:${entry.end}`,
      `SEQUENCE:${entry.sequence}`,
      `SUMMARY:${text(entry.summary)}`,
      ...(entry.description === null
        ? []
        : [`DESCRIPTION:${text(entry.description)}`]),
      ...(entry.location === null ? [] : [`LOCATION:${text(entry.location)}`]),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
describe("independent X24 ICS publication assertions", () => {
  it("parses actual folded text and exposes hashes rather than names or URLs", () => {
    const value = event({
      description: "Safe, permitted; note\nSecond line",
      summary: "Annual leave",
    });
    const result = assertXeroFeedPublication({
      body: body([value]).replace(
        "SUMMARY:Annual leave",
        "SUMMARY:Annual\r\n  leave"
      ),
      expected: expected({ events: [value] }),
    });
    expect(result.eventCount).toBe(1);
    expect(result.events[0]?.uidHash).toBe(
      createHash("sha256").update(uid).digest("hex")
    );
    expect(JSON.stringify(result)).not.toContain(uid);
    expect(JSON.stringify(result)).not.toContain("Annual leave");
  });
  it.each([
    "uid",
    "date",
    "unexpected",
    "duplicate",
    "missing-sequence",
    "malformed",
    "invalid-date",
  ])("rejects %s instead of inventing feed correctness", (fault) => {
    let value = body();
    if (fault === "uid") {
      value = value.replace(uid, "changed@ical.teamcalendar.online");
    }
    if (fault === "date") {
      value = value.replace("20261003", "20261004");
    }
    if (fault === "unexpected") {
      value = body([
        event(),
        event({ uid: "unexpected@ical.teamcalendar.online" }),
      ]);
    }
    if (fault === "duplicate") {
      value = body([event(), event()]);
    }
    if (fault === "missing-sequence") {
      value = value.replace("SEQUENCE:4\r\n", "");
    }
    if (fault === "malformed") {
      value = value.replace("END:VEVENT\r\n", "");
    }
    if (fault === "invalid-date") {
      value = value.replace("20261001", "20260230");
    }
    expect(() =>
      assertXeroFeedPublication({ body: value, expected: expected() })
    ).toThrow();
  });
  it("rejects folded private text even when the expectation incorrectly permits its description", () => {
    const value = event({ description: "Sensitive diagnosis" });
    expect(() =>
      assertXeroFeedPublication({
        body: body([value]).replace(
          "DESCRIPTION:Sensitive diagnosis",
          "DESCRIPTION:Sensit\r\n ive diagnosis"
        ),
        expected: expected({ events: [value] }),
      })
    ).toThrow("privacy");
  });
  it("rejects private text in property parameters as well as values", () => {
    expect(() =>
      assertXeroFeedPublication({
        body: body().replace(
          "SUMMARY:Out of office",
          "SUMMARY;X-NOTE=jane@example.test:Out of office"
        ),
        expected: expected(),
      })
    ).toThrow("privacy");
  });
  it("requires unchanged UID and exact sequence on repeat publication", () => {
    const before = assertXeroFeedPublication({
      body: body(),
      expected: expected(),
    });
    expect(
      assertXeroFeedPublication(
        {
          body: body(),
          expected: expected({ transitions: [{ kind: "unchanged", uid }] }),
        },
        before
      ).fingerprint
    ).toBe(before.fingerprint);
    const changed = event({ sequence: 5 });
    expect(() =>
      assertXeroFeedPublication(
        {
          body: body([changed]),
          expected: expected({
            events: [changed],
            transitions: [{ kind: "unchanged", uid }],
          }),
        },
        before
      )
    ).toThrow("sequence");
  });
  it("requires actual material change, stable UID and exactly previous sequence plus one", () => {
    const before = assertXeroFeedPublication({
      body: body(),
      expected: expected(),
    });
    const changed = event({ end: "20261004", sequence: 5, start: "20261002" });
    expect(
      assertXeroFeedPublication(
        {
          body: body([changed]),
          expected: expected({
            events: [changed],
            transitions: [{ kind: "material-change", uid }],
          }),
        },
        before
      ).events[0]?.sequence
    ).toBe(5);
    for (const bad of [
      event({ ...changed, sequence: 6 }),
      event({ ...changed, uid: "changed@ical.teamcalendar.online" }),
      event({ sequence: 5 }),
    ]) {
      expect(() =>
        assertXeroFeedPublication(
          {
            body: body([bad]),
            expected: expected({
              events: [bad],
              transitions: [{ kind: "material-change", uid }],
            }),
          },
          before
        )
      ).toThrow("sequence");
    }
  });
  it("requires actual withdrawal absence and a known prior event", () => {
    const before = assertXeroFeedPublication({
      body: body(),
      expected: expected(),
    });
    const withdrawn = expected({
      absentUids: [uid],
      events: [],
      transitions: [{ kind: "withdrawal", uid }],
    });
    expect(
      assertXeroFeedPublication({ body: body([]), expected: withdrawn }, before)
        .eventCount
    ).toBe(0);
    expect(() =>
      assertXeroFeedPublication({ body: body(), expected: withdrawn }, before)
    ).toThrow();
    expect(() =>
      assertXeroFeedPublication({ body: body([]), expected: withdrawn })
    ).toThrow("baseline");
  });
  it("supports exact UTC timed events without calling the production renderer", () => {
    const value = event({
      allDay: false,
      end: "20261001T170000Z",
      start: "20261001T090000Z",
    });
    expect(
      assertXeroFeedPublication({
        body: body([value]),
        expected: expected({ events: [value] }),
      }).eventCount
    ).toBe(1);
  });
});

const privateUrl =
  "https://api.example/ical/synthetic-complete-private-capability.ics";
const fixture = {
  alias: "fixture-owned",
  clerkOrgId: "org_owned",
  feedId: "00000000-0000-4000-8000-000000000002",
  organisationId: "00000000-0000-4000-8000-000000000001",
};
function feedRequest() {
  return {
    get: vi.fn(async () => ({
      headers: () => ({ "content-type": "text/calendar; charset=utf-8" }),
      status: () => 200,
      text: async () => body(),
      url: () => privateUrl,
    })),
  };
}
describe("owned X24 feed retrieval", () => {
  it("verifies exact ownership before requesting the complete capability and publishes no URL", async () => {
    const request = feedRequest();
    const authority = vi.fn(() => {
      expect(request.get).not.toHaveBeenCalled();
      return Promise.resolve();
    });
    const result = await fetchAndAssertXeroFeedPublication({
      approvedApiOrigin: "https://api.example",
      assertOwned: authority,
      expected: expected(),
      fixture,
      privateUrl,
      request,
    });
    expect(authority).toHaveBeenCalledWith(fixture, privateUrl);
    expect(request.get).toHaveBeenCalledWith(privateUrl, {
      failOnStatusCode: false,
      maxRedirects: 0,
      timeout: 30_000,
    });
    expect(JSON.stringify(result)).not.toContain("private-capability");
    expect(JSON.stringify(result)).not.toContain("https://");
  });
  it.each([
    "https://foreign.example/ical/synthetic.ics",
    `${privateUrl}?token=private`,
    `${privateUrl}#fragment`,
    "https://api.example/ical/***.ics",
    "https://api.example/admin",
  ])(
    "rejects an unsafe or incomplete capability before request",
    async (address) => {
      const request = feedRequest();
      const authority = vi.fn();
      await expect(
        fetchAndAssertXeroFeedPublication({
          approvedApiOrigin: "https://api.example",
          assertOwned: authority,
          expected: expected(),
          fixture,
          privateUrl: address,
          request,
        })
      ).rejects.toThrow("address");
      expect(request.get).not.toHaveBeenCalled();
      expect(authority).not.toHaveBeenCalled();
    }
  );
  it("rejects wrong owner and suppresses private error text before requesting", async () => {
    const request = feedRequest();
    await expect(
      fetchAndAssertXeroFeedPublication({
        approvedApiOrigin: "https://api.example",
        assertOwned: () => Promise.reject(new Error(privateUrl)),
        expected: expected(),
        fixture,
        privateUrl,
        request,
      })
    ).rejects.toThrow("ownership is unverified");
    expect(request.get).not.toHaveBeenCalled();
  });
  it("refuses redirects/non-calendar responses and sanitises transport errors", async () => {
    const request = {
      get: vi.fn(() => Promise.reject(new Error(privateUrl))),
    };
    await expect(
      fetchAndAssertXeroFeedPublication({
        approvedApiOrigin: "https://api.example",
        assertOwned: () => Promise.resolve(),
        expected: expected(),
        fixture,
        privateUrl,
        request,
      })
    ).rejects.toThrow("Authorised feed retrieval failed");
    const wrongContent = {
      get: vi.fn(() =>
        Promise.resolve({
          headers: () => ({ "content-type": "text/html" }),
          status: () => 200,
          text: () => Promise.resolve(body()),
          url: () => privateUrl,
        })
      ),
    };
    await expect(
      fetchAndAssertXeroFeedPublication({
        approvedApiOrigin: "https://api.example",
        assertOwned: () => Promise.resolve(),
        expected: expected(),
        fixture,
        privateUrl,
        request: wrongContent,
      })
    ).rejects.toThrow("retrieval failed");
    for (const status of [302, 401, 410]) {
      const wrong = {
        get: vi.fn(async () => ({
          headers: () => ({ "content-type": "text/calendar" }),
          status: () => status,
          text: async () => body(),
          url: () => privateUrl,
        })),
      };
      await expect(
        fetchAndAssertXeroFeedPublication({
          approvedApiOrigin: "https://api.example",
          assertOwned: () => Promise.resolve(),
          expected: expected(),
          fixture,
          privateUrl,
          request: wrong,
        })
      ).rejects.toThrow("retrieval failed");
    }
  });
});
function facts(
  overrides: Partial<XeroReadonlyLayoutFacts> = {}
): XeroReadonlyLayoutFacts {
  return {
    backgroundLuminance: 0.98,
    blockedMutations: 0,
    computedTheme: "light",
    keyboard: {
      announcementChanged: true,
      focused: true,
      focusVisible: true,
      ringWidth: 3,
    },
    landmarks: [{ left: 16, right: 374, visible: true }],
    scrollWidth: 390,
    viewportHeight: 900,
    viewportWidth: 390,
    ...overrides,
  };
}
const layoutExpected = {
  colourScheme: "light" as const,
  height: 900,
  keyboardRequired: true,
  landmarkCount: 1,
  width: 390 as const,
};
describe("X25 observed layout/focus/announcement assertions", () => {
  it("accepts measured light and dark layouts", () => {
    expect(assertXeroReadonlyLayoutFacts(facts(), layoutExpected)).toMatch(
      hashFormat
    );
    expect(
      assertXeroReadonlyLayoutFacts(
        facts({ backgroundLuminance: 0.06, computedTheme: "dark" }),
        { ...layoutExpected, colourScheme: "dark" }
      )
    ).toMatch(hashFormat);
  });
  it.each([
    { scrollWidth: 1000 },
    { viewportWidth: 768 },
    { computedTheme: "dark" },
    { backgroundLuminance: 0.1 },
    { landmarks: [{ left: 16, right: 374, visible: false }] },
    { landmarks: [{ left: 16, right: 500, visible: true }] },
    { blockedMutations: 1 },
  ] satisfies Partial<XeroReadonlyLayoutFacts>[])(
    "rejects measured viewport/theme/layout/mutation faults %j",
    (fault) => {
      expect(() =>
        assertXeroReadonlyLayoutFacts(facts(fault), layoutExpected)
      ).toThrow();
    }
  );
  it.each([
    { focused: false },
    { focusVisible: false },
    { ringWidth: 0 },
    { announcementChanged: false },
  ])("rejects keyboard or live-region fault %j", (fault) => {
    expect(() =>
      assertXeroReadonlyLayoutFacts(
        facts({
          keyboard: {
            announcementChanged: true,
            focused: true,
            focusVisible: true,
            ringWidth: 3,
            ...fault,
          },
        }),
        layoutExpected
      )
    ).toThrow("keyboard");
  });
});
const directories: string[] = [];
function screenshotDirectory() {
  const root = resolve("tooling/release/test-results");
  mkdirSync(root, { mode: 0o700, recursive: true });
  chmodSync(root, 0o700);
  const directory = mkdtempSync(`${root}/readonly-unit-`);
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});
let browser: Browser | undefined;
const browserAvailable = existsSync(chromium.executablePath());
describe.runIf(browserAvailable)(
  "X25 controlled static HTML browser probes (no application/provider)",
  () => {
    beforeAll(async () => {
      browser = await chromium.launch({
        args: ["--no-sandbox"],
        headless: true,
      });
    });
    afterAll(async () => {
      await browser?.close();
    });
    it("measures all six actual viewports/themes and private screenshot bytes", async () => {
      if (!browser) {
        throw new Error("Static browser unavailable");
      }
      const page = await browser.newPage();
      try {
        await page.setContent(
          '<style>html{color-scheme:light;background:#fcf8ff}body{margin:16px} @media(prefers-color-scheme:dark){html{color-scheme:dark;background:#131218;color:#e6e1ec}}</style><main aria-label="Read-only onboarding">Safe controlled fixture</main>'
        );
        const directory = screenshotDirectory();
        for (const width of [390, 768, 1440] as const) {
          for (const colourScheme of ["light", "dark"] as const) {
            const result = await verifyXeroReadonlyLayout(page, {
              colourScheme,
              height: 900,
              landmarks: [{ name: "Read-only onboarding", role: "main" }],
              screenshotDirectory: directory,
              width,
            });
            expect(result.width).toBe(width);
            expect(result.colourScheme).toBe(colourScheme);
          }
        }
        const screenshots = readdirSync(directory);
        expect(screenshots).toHaveLength(6);
        for (const path of screenshots) {
          expect(statSync(resolve(directory, path)).mode % 0o100).toBe(0);
        }
        const proof = await verifyXeroReadonlyLayout(page, {
          colourScheme: "light",
          height: 900,
          landmarks: [{ name: "Read-only onboarding", role: "main" }],
          screenshotDirectory: directory,
          width: 390,
        });
        expect(
          readdirSync(directory).some(
            (path) =>
              createHash("sha256")
                .update(readFileSync(resolve(directory, path)))
                .digest("hex") === proof.screenshotHash
          )
        ).toBe(true);
      } finally {
        await page.close();
      }
    });
    it("uses real Tab focus and changed live text, while unchanged initial status cannot pass", async () => {
      if (!browser) {
        throw new Error("Static browser unavailable");
      }
      const page = await browser.newPage();
      try {
        await page.setContent(
          '<style>html{color-scheme:light;background:#fcf8ff}button:focus-visible{outline:3px solid #336a3b}</style><main aria-label="Progress"><button id="safe">Read-only details</button><div role="status" id="status">Import in progress</div></main><script>document.getElementById("safe").addEventListener("focus",()=>setTimeout(()=>document.getElementById("status").textContent="Import complete",50))</script>'
        );
        const options = {
          colourScheme: "light" as const,
          height: 900,
          keyboard: {
            focus: { name: "Read-only details", role: "button" as const },
            maxTabs: 3,
            statusText: "Import complete",
            timeoutMs: 1000,
          },
          landmarks: [{ name: "Progress", role: "main" as const }],
          screenshotDirectory: screenshotDirectory(),
          width: 390 as const,
        };
        expect(
          (await verifyXeroReadonlyLayout(page, options)).keyboardVerified
        ).toBe(true);
        await page.setContent(
          '<style>html{color-scheme:light;background:#fcf8ff}button:focus-visible{outline:3px solid #336a3b}</style><main aria-label="Progress"><button>Read-only details</button><div role="status">Import complete</div></main>'
        );
        await expect(
          verifyXeroReadonlyLayout(page, {
            ...options,
            keyboard: { ...options.keyboard, timeoutMs: 100 },
          })
        ).rejects.toThrow("keyboard");
      } finally {
        await page.close();
      }
    });
  }
);

// Separate controlled probes remain source verification, not live application evidence.
describe.runIf(browserAvailable)(
  "X25 browser privacy and read-only faults",
  () => {
    let isolated: Browser | undefined;
    beforeAll(async () => {
      isolated = await chromium.launch({
        args: ["--no-sandbox"],
        headless: true,
      });
    });
    afterAll(async () => {
      await isolated?.close();
    });
    it("refuses insecure or symlink screenshot storage before any browser work", async () => {
      if (!isolated) {
        throw new Error("Static browser unavailable");
      }
      const page = await isolated.newPage();
      try {
        const directory = screenshotDirectory();
        const options = {
          colourScheme: "light" as const,
          height: 900,
          landmarks: [{ name: "Progress", role: "main" as const }],
          screenshotDirectory: directory,
          width: 390 as const,
        };
        chmodSync(directory, 0o755);
        await expect(verifyXeroReadonlyLayout(page, options)).rejects.toThrow(
          "not private"
        );
        chmodSync(directory, 0o700);
        const link = resolve(directory, "escape");
        symlinkSync("/tmp", link);
        await expect(
          verifyXeroReadonlyLayout(page, {
            ...options,
            screenshotDirectory: link,
          })
        ).rejects.toThrow("not private");
        expect(readdirSync(directory)).toEqual(["escape"]);
      } finally {
        await page.close();
      }
    });
    it("rejects transparent focus rings and aborts attempted POST without dispatch", async () => {
      if (!isolated) {
        throw new Error("Static browser unavailable");
      }
      const page = await isolated.newPage();
      try {
        const options = {
          colourScheme: "light" as const,
          height: 900,
          keyboard: {
            focus: { name: "Read-only details", role: "button" as const },
            maxTabs: 3,
            statusText: "Import complete",
            timeoutMs: 300,
          },
          landmarks: [{ name: "Progress", role: "main" as const }],
          screenshotDirectory: screenshotDirectory(),
          width: 390 as const,
        };
        const staticMarkup =
          '<style>html{color-scheme:light;background:#fcf8ff}button:focus-visible{outline:3px solid transparent}</style><main aria-label="Progress"><button id="safe">Read-only details</button><div role="status" id="status">Import in progress</div></main><script>document.getElementById("safe").addEventListener("focus",()=>setTimeout(()=>document.getElementById("status").textContent="Import complete",50))</script>';
        await page.setContent(staticMarkup);
        await expect(verifyXeroReadonlyLayout(page, options)).rejects.toThrow(
          "keyboard"
        );
        for (const colour of ["transparent", "#336a3b"]) {
          await page.setContent(
            staticMarkup.replace(
              "</style>",
              `button{box-shadow:0 0 0 3px ${colour}}</style>`
            )
          );
          await expect(verifyXeroReadonlyLayout(page, options)).rejects.toThrow(
            "keyboard"
          );
        }
        await page.setContent(
          staticMarkup
            .replace("solid transparent", "solid #336a3b")
            .replace(
              "()=>setTimeout",
              '()=>{fetch("https://synthetic.invalid/",{method:"POST"}).catch(()=>{});return setTimeout'
            )
            .replace('"Import complete",50))', '"Import complete",50)} )')
        );
        await expect(verifyXeroReadonlyLayout(page, options)).rejects.toThrow(
          "attempted a mutation"
        );
        expect(readdirSync(options.screenshotDirectory)).toHaveLength(0);
      } finally {
        await page.close();
      }
    });
  }
);
