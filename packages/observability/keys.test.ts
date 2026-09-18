import { afterEach, describe, expect, it, vi } from "vitest";
import { keys, parseBetterStackConfiguration } from "./keys";

const configured = {
  BETTERSTACK_API_KEY: "secret-token",
  BETTERSTACK_STATUS_PAGE_ID: "status-page-id",
  BETTERSTACK_STATUS_PAGE_URL: "https://status.example.com",
};

describe("Better Stack environment configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows the complete group to be absent", () => {
    expect(parseBetterStackConfiguration({}, "production")).toEqual({});
  });

  it("accepts a complete configuration", () => {
    expect(parseBetterStackConfiguration(configured, "production")).toEqual(
      configured
    );
  });

  it.each([
    { BETTERSTACK_API_KEY: configured.BETTERSTACK_API_KEY },
    { BETTERSTACK_STATUS_PAGE_ID: configured.BETTERSTACK_STATUS_PAGE_ID },
    {
      BETTERSTACK_STATUS_PAGE_URL: configured.BETTERSTACK_STATUS_PAGE_URL,
    },
  ])("rejects a partial group", (input) => {
    expect(() => parseBetterStackConfiguration(input)).toThrow(
      "must provide the API key, status page ID, and public status page URL together"
    );
  });

  it("rejects malformed URLs", () => {
    expect(() =>
      parseBetterStackConfiguration({
        ...configured,
        BETTERSTACK_STATUS_PAGE_URL: "not-a-url",
      })
    ).toThrow();
  });

  it("requires HTTPS for production", () => {
    expect(() =>
      parseBetterStackConfiguration(
        {
          ...configured,
          BETTERSTACK_STATUS_PAGE_URL: "http://status.example.com",
        },
        "production"
      )
    ).toThrow("must use HTTPS in production");
  });

  it("does not read server-only status keys in a browser", () => {
    vi.stubGlobal("window", {});

    expect(() => keys()).not.toThrow();
  });
});
