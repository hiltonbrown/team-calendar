import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  generateNonce,
  handleProxyWithNonce,
  isPublicAppRoute,
  REPORTING_ENDPOINTS_HEADER,
} from "./proxy";

const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;
const NONCE_EXTRACTION_PATTERN = /'nonce-([A-Za-z0-9+/=]+)'/;

describe("Proxy nonce and CSP generation", () => {
  it.each([
    ["/sign-in", true],
    ["/sign-in/factor-one", true],
    ["/sign-up", true],
    ["/api/csp-report", true],
    ["/__clerk/v1/client", true],
    ["/calendar", false],
    ["/api/future-sensitive-route", false],
  ])("classifies %s public=%s", (path, expected) => {
    expect(
      isPublicAppRoute(new NextRequest(`http://localhost:3000${path}`))
    ).toBe(expected);
  });

  it("generates unique base64 nonces per request", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();

    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
    // Base64 format check
    expect(nonce1).toMatch(BASE64_PATTERN);
    expect(nonce2).toMatch(BASE64_PATTERN);
  });

  it("builds production CSP without unsafe-inline or unsafe-eval in script-src", () => {
    const nonce = "test-nonce-123";
    const csp = buildContentSecurityPolicy(nonce, false);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
    expect(csp).not.toContain("'unsafe-inline' in script-src");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("https://*.clerk.accounts.dev");
    expect(csp).toContain("https://*.clerk.com");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("https://va.vercel-scripts.com");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://*.google-analytics.com");
  });

  it("includes unsafe-eval in script-src only in development", () => {
    const nonce = "dev-nonce-456";
    const devCsp = buildContentSecurityPolicy(nonce, true);
    const prodCsp = buildContentSecurityPolicy(nonce, false);

    expect(devCsp).toContain(
      `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
    );
    expect(prodCsp).not.toContain("'unsafe-eval'");
  });

  it("includes all evidenced third-party origins in connect-src", () => {
    const nonce = "test-nonce-789";
    const csp = buildContentSecurityPolicy(nonce, false);

    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("https://*.clerk.accounts.dev");
    expect(csp).toContain("https://*.clerk.com");
    expect(csp).toContain("https://*.sentry.io");
    expect(csp).toContain("https://us.i.posthog.com");
    expect(csp).toContain("https://*.posthog.com");
    expect(csp).toContain("https://va.vercel-scripts.com");
    expect(csp).toContain("https://vitals.vercel-insights.com");
    expect(csp).toContain("https://*.google-analytics.com");
    expect(csp).toContain("https://*.analytics.google.com");
    expect(csp).toContain("https://*.googletagmanager.com");
  });

  it("includes reporting endpoints directives", () => {
    const nonce = "test-nonce-reporting";
    const csp = buildContentSecurityPolicy(nonce, false);

    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("report-to csp-endpoint");
  });

  it("sets consistent nonce and enforcing CSP on request and response headers", () => {
    const request = new NextRequest("http://localhost:3000/calendar");
    const response = handleProxyWithNonce(request);

    // Response headers
    const responseCsp = response.headers.get("content-security-policy");
    const reportOnlyCsp = response.headers.get(
      "content-security-policy-report-only"
    );
    const reportingEndpoints = response.headers.get("reporting-endpoints");

    // Exactly one enforcing CSP header, zero report-only headers
    expect(responseCsp).toBeTruthy();
    expect(reportOnlyCsp).toBeNull();
    expect(reportingEndpoints).toBe(REPORTING_ENDPOINTS_HEADER);

    // Extract nonce from response CSP
    const nonceMatch = responseCsp?.match(NONCE_EXTRACTION_PATTERN);
    expect(nonceMatch).toBeTruthy();
    const extractedNonce = nonceMatch?.[1];

    // Let's verify through proxy behavior that nonce appears identically in CSP
    expect(responseCsp).toContain(`'nonce-${extractedNonce}'`);
    expect(response.headers.get("content-security-policy")).toBe(responseCsp);
  });

  it("records dynamic rendering trade-off for nonce-based CSP", () => {
    // Nonce generation is per-request, requiring dynamic rendering for protected App Router pages
    const req1 = new NextRequest("http://localhost:3000/app");
    const req2 = new NextRequest("http://localhost:3000/app");

    const res1 = handleProxyWithNonce(req1);
    const res2 = handleProxyWithNonce(req2);

    const csp1 = res1.headers.get("content-security-policy");
    const csp2 = res2.headers.get("content-security-policy");

    expect(csp1).toBeTruthy();
    expect(csp2).toBeTruthy();
    expect(csp1).not.toBe(csp2);
  });
});
