import { describe, expect, it } from "vitest";
import { authContextBuckets } from "./context-rate-limit";

const origin = "http://localhost:3000";
const request = (token?: string) =>
  new Request(origin, {
    headers: {
      "x-vercel-forwarded-for": "192.0.2.5",
      ...(token
        ? {
            cookie: `team-calendar-dev-auth.session_token=${token}; unrelated=secret`,
          }
        : {}),
    },
  });
describe("online auth resolver admission", () => {
  it("isolates sessions sharing an API egress address while bounding that address", () => {
    const first = authContextBuckets(request("first"), origin, true);
    const second = authContextBuckets(request("second"), origin, true);
    expect(first[0]).toEqual(second[0]);
    expect(first[1].key).not.toBe(second[1].key);
    expect(first[1].limit).toBe(100);
    expect(JSON.stringify(first)).not.toContain("first");
    expect(JSON.stringify(first)).not.toContain("secret");
  });
  it("gives anonymous attempts a separate bounded bucket", () => {
    expect(authContextBuckets(request(), origin, true)).toMatchObject([
      { limit: 100 },
    ]);
    expect(authContextBuckets(request(), origin, true)[0].key).toContain(
      ":anonymous:"
    );
  });
  it("rejects ambiguous duplicate session cookies", () => {
    const input = request("first");
    input.headers.append(
      "cookie",
      "; team-calendar-dev-auth.session_token=second"
    );
    expect(() => authContextBuckets(input, origin, true)).toThrow(
      "Duplicate auth cookie"
    );
  });
});
