import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyApiRequest } from "./api-proxy";

vi.mock("server-only", () => ({}));
const fetchMock = vi.fn();
const app = "https://candidate-app.vercel.app";
const api = "https://candidate-api.vercel.app";
const cookie = "__Secure-team-calendar-auth.session_token=opaque";
describe("fixed same-origin API proxy", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_PROVIDER", "better-auth");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", app);
    vi.stubEnv("NEXT_PUBLIC_API_URL", api);
    vi.stubEnv("TC_APP_CANDIDATE_URL", app);
    vi.stubEnv("TC_API_CANDIDATE_URL", api);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("streams an allowlisted path to the fixed API, forwarding only session and event cursor", async () => {
    fetchMock.mockResolvedValue(
      new Response("data: ready\n\n", {
        headers: { "content-type": "text/event-stream" },
      })
    );
    const response = await proxyApiRequest(
      new Request(`${app}/api/notifications/stream`, {
        headers: {
          authorization: "Bearer ignored",
          cookie: `${cookie}; private=hidden`,
          "last-event-id": "123-0",
          "x-forwarded-host": "attacker.test",
        },
      })
    );
    expect(await response.text()).toBe("data: ready\n\n");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe(`${api}/api/notifications/stream`);
    expect([...options.headers]).toEqual([
      ["cookie", cookie],
      ["last-event-id", "123-0"],
      ["origin", app],
    ]);
    expect(options.redirect).toBe("manual");
  });
  it("preserves payroll nonce path, cookie attributes and external authorisation redirect", async () => {
    const nonce =
      "xero_oauth_nonce=value; Path=/api/xero/oauth; HttpOnly; Secure; SameSite=Lax";
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: {
          location:
            "https://login.xero.com/identity/connect/authorize?state=signed",
          "set-cookie": nonce,
        },
        status: 307,
      })
    );
    const response = await proxyApiRequest(
      new Request(`${app}/api/xero/oauth/start?accountId=account`, {
        headers: { cookie },
      })
    );
    expect(response.status).toBe(307);
    expect(response.headers.getSetCookie()).toEqual([nonce]);
    expect(response.headers.get("location")).toContain(
      "https://login.xero.com/"
    );
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: { location: `${app}/settings/integrations/xero` },
        status: 302,
      })
    );
    await proxyApiRequest(
      new Request(`${app}/api/xero/oauth/callback?code=code&state=state`, {
        headers: {
          cookie: `${cookie}; xero_oauth_nonce=value; private=hidden`,
        },
      })
    );
    expect(fetchMock.mock.calls[1][1].headers.get("cookie")).toBe(
      `${cookie}; xero_oauth_nonce=value`
    );
  });
  it("denies arbitrary URLs, auth surfaces, methods and mutation origins before forwarding", async () => {
    for (const path of [
      "/api/auth/get-access-token",
      "/api/inngest",
      "/api/unknown",
      "/api/https://attacker.test",
    ]) {
      expect((await proxyApiRequest(new Request(`${app}${path}`))).status).toBe(
        404
      );
    }
    expect(
      (
        await proxyApiRequest(
          new Request(`${app}/api/sync/dispatch`, { method: "GET" })
        )
      ).status
    ).toBe(405);
    expect(
      (
        await proxyApiRequest(
          new Request(`${app}/api/sync/dispatch`, { method: "POST" })
        )
      ).status
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects unexpected credential cookies and redirects", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        headers: { "set-cookie": "private=value; HttpOnly" },
        status: 200,
      })
    );
    expect(
      (await proxyApiRequest(new Request(`${app}/api/notifications/stream`)))
        .status
    ).toBe(502);
    fetchMock.mockResolvedValue(
      Response.redirect("https://attacker.test/steal", 302)
    );
    expect(
      (await proxyApiRequest(new Request(`${app}/api/notifications/stream`)))
        .status
    ).toBe(502);
  });
});
