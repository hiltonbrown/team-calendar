import type { NotificationSseEvent } from "./broker";

const STREAM_MAX_LENGTH = 100;
const STREAM_TTL_SECONDS = 300;

export interface NotificationSseStreamEntry {
  event: NotificationSseEvent;
  id: string;
}

export interface NotificationSseStreamClient {
  append: (channel: string, event: NotificationSseEvent) => Promise<void>;
  readSince: (
    channel: string,
    lastId: string
  ) => Promise<NotificationSseStreamEntry[]>;
}

let streamClient: NotificationSseStreamClient | null = null;
let streamClientResolved = false;

export function getNotificationSseStreamClient(): NotificationSseStreamClient | null {
  if (streamClientResolved) {
    return streamClient;
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (Boolean(url) !== Boolean(token)) {
    throw new Error(
      "KV_REST_API_URL and KV_REST_API_TOKEN must both be set or both omitted to configure notification SSE."
    );
  }

  streamClient = url && token ? createRestStreamClient({ token, url }) : null;
  streamClientResolved = true;
  return streamClient;
}

export function setNotificationSseStreamClientForTests(
  client: NotificationSseStreamClient | null
): void {
  streamClient = client;
  streamClientResolved = true;
}

function createRestStreamClient(input: {
  token: string;
  url: string;
}): NotificationSseStreamClient {
  const command = async <T>(parts: string[]): Promise<T> => {
    const response = await fetch(input.url, {
      body: JSON.stringify(parts),
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("Notification SSE stream command failed");
    }
    const payload = (await response.json()) as { result: T };
    return payload.result;
  };

  return {
    append: async (channel, event) => {
      await command([
        "xadd",
        channel,
        "maxlen",
        "~",
        String(STREAM_MAX_LENGTH),
        "*",
        "event",
        JSON.stringify(event),
      ]);
      await command(["expire", channel, String(STREAM_TTL_SECONDS)]);
    },
    readSince: async (channel, lastId) => {
      const rows = await command<unknown[]>([
        "xrange",
        channel,
        `(${lastId}`,
        "+",
      ]);
      return rows.flatMap(parseStreamEntry);
    },
  };
}

function parseStreamEntry(value: unknown): NotificationSseStreamEntry[] {
  if (!Array.isArray(value) || value.length !== 2) {
    return [];
  }
  const [id, fields] = value;
  if (typeof id !== "string" || !Array.isArray(fields)) {
    return [];
  }
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] !== "event" || typeof fields[index + 1] !== "string") {
      continue;
    }
    try {
      // Values are written by append above; malformed external stream entries are ignored.
      return [
        { event: JSON.parse(fields[index + 1]) as NotificationSseEvent, id },
      ];
    } catch {
      return [];
    }
  }
  return [];
}
