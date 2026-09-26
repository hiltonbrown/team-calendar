import { expect, it, vi } from "vitest";
import {
  createVerifiedXeroPublicationProbe,
  xeroPublicationAssertionSchema,
} from "./xero-publication-probe.js";
import type { XeroFeedPublicationExpectation } from "./xero-readonly-assertions.js";

const uid = "controlled-stable@ical.teamcalendar.online";
const privateUrl = "https://api.example/ical/controlled-complete-token.ics";
function expected(
  sequence: number,
  summary: string
): XeroFeedPublicationExpectation {
  return {
    absentUids: [],
    events: [
      {
        allDay: true,
        description: null,
        end: "20261003",
        location: null,
        sequence,
        start: "20261001",
        summary,
        uid,
      },
    ],
    forbiddenText: [],
    transitions: [],
  };
}
function body(value: XeroFeedPublicationExpectation) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Controlled publication assertion//EN",
    ...value.events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTART;VALUE=DATE:${event.start}`,
      `DTEND;VALUE=DATE:${event.end}`,
      `SEQUENCE:${event.sequence}`,
      `SUMMARY:${event.summary}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
function fixture(
  kind: "sequence" | "uid-stability" | "withdrawal" = "sequence"
) {
  const baselineExpected = expected(4, "Before");
  const after = expected(5, "After");
  if (kind === "uid-stability") {
    after.events = [...baselineExpected.events];
    after.transitions = [{ kind: "unchanged", uid }];
  } else if (kind === "withdrawal") {
    after.events = [];
    after.absentUids = [uid];
    after.transitions = [{ kind: "withdrawal", uid }];
  } else {
    after.transitions = [{ kind: "material-change", uid }];
  }
  const bodies = [body(baselineExpected), body(after)];
  const get = vi.fn(() => {
    const bytes = bodies.shift();
    if (bytes === undefined) {
      return Promise.reject(new Error("Unexpected GET"));
    }
    return Promise.resolve({
      headers: () => ({ "content-type": "text/calendar" }),
      status: () => 200,
      text: () => Promise.resolve(bytes),
      url: () => privateUrl,
    });
  });
  const assertOwned = vi.fn(() => Promise.resolve());
  const assertion = {
    baselineExpected,
    expected: after,
    feedId: "00000000-0000-4000-8000-000000000001",
    privateUrl,
  };
  const input = {
    approvedApiOrigin: "https://api.example",
    assertion,
    assertOwned,
    fixture: {
      alias: "fixture-owned",
      clerkOrgId: "org_owned",
      feedId: assertion.feedId,
      organisationId: "00000000-0000-4000-8000-000000000002",
    },
    observationId: `X24.${kind}`,
    privateUrl,
    request: { get },
  };
  return { assertOwned, get, input };
}
it.each(["sequence", "uid-stability", "withdrawal"] as const)(
  "uses two actual owned GETs and the private before-read to verify %s",
  async (kind) => {
    const { input, get, assertOwned } = fixture(kind);
    const probe = createVerifiedXeroPublicationProbe(input);
    await probe.observeBefore();
    expect(get).toHaveBeenCalledOnce();
    const observed = await probe.observeAfter();
    expect(get).toHaveBeenCalledTimes(2);
    expect(assertOwned).toHaveBeenCalledTimes(2);
    const sequences = {
      sequence: 5,
      "uid-stability": 4,
      withdrawal: undefined,
    };
    expect(observed.events[0]?.sequence).toBe(sequences[kind]);
    expect(JSON.stringify(observed)).not.toContain(privateUrl);
    expect(JSON.stringify(observed)).not.toContain("Before");
  }
);
it("rejects a declared previous observation before any request", () => {
  const { input, get } = fixture();
  const forged = {
    ...input.assertion,
    previous: {
      eventCount: 1,
      events: [
        {
          representationHash: "c".repeat(64),
          sequence: 4,
          uidHash: "b".repeat(64),
        },
      ],
      fingerprint: "a".repeat(64),
      observedAt: new Date().toISOString(),
    },
  };
  expect(() => xeroPublicationAssertionSchema.parse(forged)).toThrow();
  expect(() =>
    createVerifiedXeroPublicationProbe({ ...input, assertion: forged })
  ).toThrow();
  expect(get).not.toHaveBeenCalled();
});
it("requires a real verified before-read before the after-read", async () => {
  const { input, get } = fixture();
  await expect(
    createVerifiedXeroPublicationProbe(input).observeAfter()
  ).rejects.toThrow("has not been observed");
  expect(get).not.toHaveBeenCalled();
});
it("a forged baseline expectation fails the actual before-read before any mutation can run", async () => {
  const { input, get } = fixture();
  input.assertion.baselineExpected.events[0] = {
    ...expected(99, "Invented").events[0],
  };
  const probe = createVerifiedXeroPublicationProbe(input);
  const mutation = vi.fn();
  await expect(probe.observeBefore().then(mutation)).rejects.toThrow();
  expect(mutation).not.toHaveBeenCalled();
  expect(get).toHaveBeenCalledOnce();
});
it("cannot substitute another feed or replay a baseline", async () => {
  const { input } = fixture();
  expect(() =>
    createVerifiedXeroPublicationProbe({
      ...input,
      privateUrl: "https://api.example/ical/foreign.ics",
    })
  ).toThrow("foreign feed");
  const probe = createVerifiedXeroPublicationProbe(input);
  await probe.observeBefore();
  await expect(probe.observeBefore()).rejects.toThrow("replayed");
});

it("rejects a transition without its specific event in the before-read contract", () => {
  const { input, get } = fixture();
  input.assertion.baselineExpected.events = [];
  expect(() => createVerifiedXeroPublicationProbe(input)).toThrow(
    "before-read contract"
  );
  expect(get).not.toHaveBeenCalled();
});
