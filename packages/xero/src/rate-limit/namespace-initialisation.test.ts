import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XERO_ADMISSION_SCRIPT } from "./admission.lua";
import { parseXeroNamespaceInitialisationArgs } from "./namespace-initialisation";
import { initialiseXeroRateNamespace } from "./shared-store";

const scope = [
  "--epoch",
  "campaign-v1",
  "--credential-domain-id",
  "00000000-0000-4000-8000-000000000001",
];
describe("explicit rate namespace initialisation policy", () => {
  it("preserves conservative initialisation", () => {
    expect(
      parseXeroNamespaceInitialisationArgs([...scope, "--assume-spent-daily"])
    ).toMatchObject({ assumeSpentDaily: true, policy: "conservative" });
  });
  it("allows explicitly authorised immediate admission while acknowledging unknown prior usage", () => {
    expect(
      parseXeroNamespaceInitialisationArgs([
        ...scope,
        "--allow-immediate-admission",
        "--acknowledge-unknown-prior-usage",
      ])
    ).toMatchObject({
      assumeSpentDaily: false,
      epoch: "campaign-v1",
      policy: "authorised-immediate",
    });
  });
  it.each([
    [],
    ["--allow-immediate-admission"],
    ["--acknowledge-unknown-prior-usage"],
    [
      "--assume-spent-daily",
      "--allow-immediate-admission",
      "--acknowledge-unknown-prior-usage",
    ],
    ["--assume-spent-daily", "--acknowledge-unknown-prior-usage"],
  ])("rejects missing or contradictory policy %j", (flags) => {
    expect(() =>
      parseXeroNamespaceInitialisationArgs([...scope, ...flags])
    ).toThrow();
  });
  it("rejects malformed domain or namespace before any store operation", () => {
    expect(() =>
      parseXeroNamespaceInitialisationArgs([
        "--epoch",
        "other:namespace",
        "--credential-domain-id",
        "invalid",
        "--assume-spent-daily",
      ])
    ).toThrow();
  });
});

const environment = vi.hoisted(() => ({
  KV_REST_API_TOKEN: "synthetic-token",
  KV_REST_API_URL: "https://invalid.example",
  XERO_CLIENT_ID: "fixture-app",
  XERO_CREDENTIAL_DOMAIN_ID: "00000000-0000-4000-8000-000000000001",
  XERO_RATE_NAMESPACE_EPOCH: "campaign-v1",
}));
vi.mock("../../keys", () => ({
  keys: () => environment,
  resolveXeroDailyAllowance: () => 1000,
}));
beforeEach(() => {
  environment.XERO_RATE_NAMESPACE_EPOCH = "campaign-v1";
  environment.XERO_CREDENTIAL_DOMAIN_ID =
    "00000000-0000-4000-8000-000000000001";
});
afterEach(() => vi.unstubAllGlobals());
describe("immediate operator store boundary", () => {
  it("does not retry or issue reset commands when the namespace already exists", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ result: ["existing"] }))
    );
    vi.stubGlobal("fetch", fetchImpl);
    const parsed = parseXeroNamespaceInitialisationArgs([
      ...scope,
      "--allow-immediate-admission",
      "--acknowledge-unknown-prior-usage",
    ]);
    expect(await initialiseXeroRateNamespace(parsed)).toEqual({
      initialised: 0,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const command: unknown[] = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body)
    );
    expect(command.slice(0, 3)).toEqual(["EVAL", XERO_ADMISSION_SCRIPT, 7]);
    expect(command.slice(10, 16)).toEqual([
      "initialise",
      "token",
      60,
      1000,
      10_000,
      5,
    ]);
    expect(command[17]).toBe(environment.XERO_CREDENTIAL_DOMAIN_ID);
    expect(command[18]).toBe("false");
  });
  it.each(["epoch", "domain"])(
    "rejects a configured %s mismatch before contacting the store",
    async (field) => {
      const fetchImpl = vi.fn();
      vi.stubGlobal("fetch", fetchImpl);
      const parsed = parseXeroNamespaceInitialisationArgs([
        ...scope,
        "--allow-immediate-admission",
        "--acknowledge-unknown-prior-usage",
      ]);
      if (field === "epoch") {
        environment.XERO_RATE_NAMESPACE_EPOCH = "different";
      } else {
        environment.XERO_CREDENTIAL_DOMAIN_ID =
          "00000000-0000-4000-8000-000000000002";
      }
      await expect(initialiseXeroRateNamespace(parsed)).rejects.toThrow(
        "configured namespace"
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );
});
