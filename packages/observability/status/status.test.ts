import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deriveOverallState,
  getPublicStatus,
  normaliseComponentState,
  type PublicStatusComponent,
  publicComponentNames,
} from "./index";

const configuration = {
  BETTERSTACK_API_KEY: "private-api-key",
  BETTERSTACK_STATUS_PAGE_ID: "private-page-id",
  BETTERSTACK_STATUS_PAGE_URL: "https://status.example.com",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
const page = {
  data: {
    attributes: { published: true, subscribable: true },
    id: "private-page-id",
    type: "status_page",
  },
};
const resourcesFor = (states: string[]) => ({
  data: publicComponentNames.map((name, index) => ({
    attributes: { position: index, public_name: name, status: states[index] },
    id: `resource-${index}`,
    type: "status_page_resource",
  })),
});
const reports = { data: [] };

const providerFetch = (
  overrides: {
    page?: unknown;
    reports?: unknown;
    resources?: unknown;
    updates?: Record<string, unknown>;
  } = {}
) =>
  vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/resources")) {
      return Promise.resolve(
        json(
          overrides.resources ?? resourcesFor(new Array(5).fill("operational"))
        )
      );
    }
    if (url.endsWith("/status-reports")) {
      return Promise.resolve(json(overrides.reports ?? reports));
    }
    if (url.includes("/status-updates")) {
      const reportId = url.split("/status-reports/")[1]?.split("/")[0] ?? "";
      return Promise.resolve(
        json(overrides.updates?.[reportId] ?? { data: [] })
      );
    }
    return Promise.resolve(json(overrides.page ?? page));
  });

describe("public Better Stack status", () => {
  it("returns operational only for all five validated resources", async () => {
    const result = await getPublicStatus({
      configuration,
      fetcher: providerFetch(),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        checkedAt: "2026-08-30T01:00:00.000Z",
        incidentAvailability: "available",
        overallState: "operational",
        subscribable: true,
      },
    });
    if (result.ok) {
      expect(result.value.components.map(({ name }) => name)).toEqual(
        publicComponentNames
      );
      expect(result.value.components).toHaveLength(5);
    }
  });

  it.each([
    ["operational", "operational"],
    ["degraded", "degraded"],
    ["downtime", "outage"],
    ["maintenance", "maintenance"],
    ["not_monitored", "unknown"],
    ["new-provider-value", "unknown"],
    [undefined, "unknown"],
  ])("maps provider state %s to %s", (input, expected) => {
    expect(normaliseComponentState(input)).toBe(expected);
  });

  it("applies overall-state precedence", () => {
    const components = (states: PublicStatusComponent["state"][]) =>
      publicComponentNames.map((name, index) => ({
        name,
        state: states[index] ?? "unknown",
      }));

    expect(deriveOverallState(components(new Array(5).fill("outage")))).toBe(
      "major_outage"
    );
    expect(
      deriveOverallState(
        components([
          "outage",
          "operational",
          "degraded",
          "maintenance",
          "operational",
        ])
      )
    ).toBe("partial_outage");
    expect(
      deriveOverallState(
        components([
          "degraded",
          "operational",
          "operational",
          "maintenance",
          "operational",
        ])
      )
    ).toBe("degraded");
    expect(
      deriveOverallState(
        components([
          "maintenance",
          "operational",
          "operational",
          "operational",
          "operational",
        ])
      )
    ).toBe("maintenance");
    expect(
      deriveOverallState(
        components([
          "unknown",
          "operational",
          "operational",
          "operational",
          "operational",
        ])
      )
    ).toBe("unknown");
  });

  it("ignores unknown resources and marks missing required resources unknown", async () => {
    const resourcePayload: {
      data: {
        attributes: { position: number; public_name: string; status: string };
        id: string;
        type: string;
      }[];
    } = resourcesFor(new Array(5).fill("operational"));
    resourcePayload.data = [
      ...resourcePayload.data.slice(0, 4),
      {
        attributes: {
          position: 9,
          public_name: "Private database monitor",
          status: "operational",
        },
        id: "private-resource-id",
        type: "status_page_resource",
      },
    ];
    const result = await getPublicStatus({
      configuration,
      fetcher: providerFetch({ resources: resourcePayload }),
    });

    expect(result).toMatchObject({
      ok: true,
      value: { overallState: "unknown" },
    });
    if (result.ok) {
      expect(result.value.components).toHaveLength(5);
      expect(result.value.components[4]).toMatchObject({ state: "unknown" });
      expect(JSON.stringify(result.value)).not.toContain("Private database");
      expect(JSON.stringify(result.value)).not.toContain("private-resource-id");
    }
  });

  it("never treats empty, duplicate, or unpublished resources as operational", async () => {
    const complete = resourcesFor(new Array(5).fill("operational"));
    const empty = await getPublicStatus({
      configuration,
      fetcher: providerFetch({ resources: { data: [] } }),
    });
    const duplicate = await getPublicStatus({
      configuration,
      fetcher: providerFetch({
        resources: { data: [...complete.data, complete.data[0]] },
      }),
    });
    const unpublished = await getPublicStatus({
      configuration,
      fetcher: providerFetch({
        page: {
          ...page,
          data: {
            ...page.data,
            attributes: { published: false, subscribable: true },
          },
        },
      }),
    });

    expect(empty).toMatchObject({
      ok: true,
      value: { overallState: "unknown" },
    });
    expect(duplicate).toMatchObject({
      ok: true,
      value: { overallState: "unknown" },
    });
    expect(unpublished).toMatchObject({
      ok: true,
      value: { overallState: "unknown", subscribable: false },
    });
  });

  it("classifies active, maintenance, and resolved reports and sorts updates newest first", async () => {
    const reportPayload = {
      data: [
        {
          attributes: {
            affected_resources: [
              { status: "downtime", status_page_resource_id: "resource-0" },
            ],
            aggregate_state: "downtime",
            ends_at: null,
            report_type: "manual",
            starts_at: "2026-08-30T00:00:00.000Z",
            title: "Sign-in interruption",
          },
          id: "active",
          type: "status_report",
        },
        {
          attributes: {
            affected_resources: [
              { status: "maintenance", status_page_resource_id: "resource-1" },
            ],
            aggregate_state: "maintenance",
            ends_at: null,
            report_type: "maintenance",
            starts_at: "2026-08-31T00:00:00.000Z",
            title: "Xero maintenance",
          },
          id: "maintenance",
          type: "status_report",
        },
        {
          attributes: {
            affected_resources: [
              { status: "operational", status_page_resource_id: "resource-2" },
            ],
            aggregate_state: "resolved",
            ends_at: "2026-08-29T03:00:00.000Z",
            report_type: "manual",
            starts_at: "2026-08-29T01:00:00.000Z",
            title: "Feed delay",
          },
          id: "resolved",
          type: "status_report",
        },
      ],
    };
    const result = await getPublicStatus({
      configuration,
      fetcher: providerFetch({
        reports: reportPayload,
        updates: {
          active: {
            data: [
              {
                attributes: {
                  affected_resources: [],
                  message: "Investigating",
                  published_at: "2026-08-30T00:05:00.000Z",
                },
                id: "u1",
                type: "status_update",
              },
              {
                attributes: {
                  affected_resources: [],
                  message: "Mitigation underway",
                  published_at: "2026-08-30T00:10:00.000Z",
                },
                id: "u2",
                type: "status_update",
              },
            ],
          },
        },
      }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.activeIncidents.map(({ state }) => state)).toEqual([
        "maintenance",
        "active",
      ]);
      expect(result.value.recentIncidents[0]?.state).toBe("resolved");
      const active = result.value.activeIncidents.find(
        ({ state }) => state === "active"
      );
      expect(active?.affectedComponents).toEqual(["App access"]);
      expect(active?.updates.map(({ message }) => message)).toEqual([
        "Mitigation underway",
        "Investigating",
      ]);
    }
  });

  it("marks incident history unavailable when one selected update fails validation", async () => {
    const result = await getPublicStatus({
      configuration,
      fetcher: providerFetch({
        reports: {
          data: [
            {
              attributes: {
                affected_resources: [],
                aggregate_state: "downtime",
                ends_at: null,
                report_type: "manual",
                starts_at: "2026-08-30T00:00:00.000Z",
                title: "Incident",
              },
              id: "active",
              type: "status_report",
            },
          ],
        },
        updates: { active: { data: [{ invalid: true }] } },
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        activeIncidents: [],
        incidentAvailability: "unavailable",
        recentIncidents: [],
      },
    });
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [404, "not_found"],
    [429, "rate_limit"],
    [500, "provider"],
  ])("maps HTTP %s to a safe %s error", async (status, code) => {
    const result = await getPublicStatus({
      configuration,
      fetcher: vi.fn(() =>
        Promise.resolve(json({ private: "payload" }, status))
      ),
    });
    expect(result).toMatchObject({ error: { code }, ok: false });
    expect(JSON.stringify(result)).not.toContain("private-api-key");
    expect(JSON.stringify(result)).not.toContain("private-page-id");
    expect(JSON.stringify(result)).not.toContain("payload");
  });

  it("fails safely for invalid responses and missing configuration", async () => {
    const invalid = await getPublicStatus({
      configuration,
      fetcher: providerFetch({ resources: { data: "not-an-array" } }),
    });
    const unconfigured = await getPublicStatus({ configuration: {} });
    expect(invalid).toMatchObject({
      error: { code: "invalid_response" },
      ok: false,
    });
    expect(unconfigured).toMatchObject({
      error: { code: "configuration" },
      ok: false,
    });
  });

  it("maps malformed JSON to an invalid-response error", async () => {
    const result = await getPublicStatus({
      configuration,
      fetcher: vi.fn(() =>
        Promise.resolve(
          new Response("{", {
            headers: { "content-type": "application/json" },
            status: 200,
          })
        )
      ),
    });

    expect(result).toMatchObject({
      error: { code: "invalid_response" },
      ok: false,
    });
  });

  it("maps network and timeout failures without exposing raw errors", async () => {
    const network = await getPublicStatus({
      configuration,
      fetcher: vi.fn(() => Promise.reject(new Error("socket secret details"))),
    });
    const timeout = await getPublicStatus({
      configuration,
      fetcher: vi.fn(
        (_, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      ),
      timeoutMs: 1,
    });
    expect(network).toMatchObject({ error: { code: "network" }, ok: false });
    expect(timeout).toMatchObject({ error: { code: "timeout" }, ok: false });
    expect(JSON.stringify(network)).not.toContain("socket secret");
  });
});
