import { gunzipSync } from "node:zlib";
import { PostHog } from "posthog-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActivationEvent } from "./activation-events";

afterEach(() => vi.unstubAllGlobals());

describe("PostHog activation delivery", () => {
  it("delivers identical deduplication fields and timestamps on a retry", async () => {
    const bodies: Uint8Array[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const body = init?.body;
        if (body instanceof Uint8Array) {
          bodies.push(body);
        } else if (body instanceof ArrayBuffer) {
          bodies.push(new Uint8Array(body));
        } else {
          throw new Error("PostHog test transport received an unexpected body");
        }
        return Promise.resolve(new Response("{}", { status: 200 }));
      })
    );
    const client = new PostHog("phc_test", {
      flushAt: 1,
      flushInterval: 0,
      host: "https://analytics.example.com",
    });
    const event = createActivationEvent({
      deduplicationKey: "msg_verified_123",
      name: "Customer Admitted",
      occurredAt: "2026-09-19T00:00:00.000Z",
      subjectId: "org_123",
    });

    client.capture(event);
    client.capture(event);
    await client.shutdown();

    expect(bodies).toHaveLength(1);
    const delivered = bodies.flatMap(
      (body) => JSON.parse(gunzipSync(body).toString("utf8")).batch
    );
    expect(delivered).toHaveLength(2);
    expect(delivered[0]).toMatchObject({
      distinct_id: event.distinctId,
      event: event.event,
      properties: event.properties,
      timestamp: "2026-09-19T00:00:00.000Z",
      uuid: event.uuid,
    });
    expect(delivered[1]).toMatchObject(delivered[0]);
  });
});
