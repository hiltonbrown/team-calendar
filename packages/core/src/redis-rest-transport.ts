import type { Result } from "../index";

export type RedisRestTransportErrorCode =
  | "aborted"
  | "http_error"
  | "invalid_response"
  | "network_error"
  | "redis_error"
  | "timeout";

export interface RedisRestTransportError {
  code: RedisRestTransportErrorCode;
  message: string;
  status?: number;
}

export interface ExecuteRedisRestCommandInput {
  command: readonly unknown[];
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  token: string;
  url: string;
}

export interface RedisRestEnvelope<T = unknown> {
  error?: string;
  result?: T;
}

function redactBasicAuthInUrl(message: string): string {
  let redacted = message;
  let searchIndex = 0;

  while (searchIndex < redacted.length) {
    const schemeIndex = redacted.indexOf("://", searchIndex);
    if (schemeIndex === -1) {
      break;
    }

    const credentialsStart = schemeIndex + 3;
    const atIndex = redacted.indexOf("@", credentialsStart);
    if (atIndex === -1) {
      searchIndex = credentialsStart;
      continue;
    }

    const slashIndex = redacted.indexOf("/", credentialsStart);
    if (slashIndex !== -1 && slashIndex < atIndex) {
      searchIndex = schemeIndex + 1;
      continue;
    }

    const colonIndex = redacted.indexOf(":", credentialsStart);
    if (colonIndex === -1 || colonIndex > atIndex) {
      searchIndex = atIndex + 1;
      continue;
    }

    const tail = redacted.slice(atIndex + 1);
    redacted = `${redacted.slice(0, credentialsStart)}[REDACTED]:[REDACTED]@${tail}`;
    searchIndex = credentialsStart + "[REDACTED]:[REDACTED]@".length;
  }

  return redacted;
}

function redactCredentials(message: string, token: string): string {
  let cleaned = message;
  if (token) {
    cleaned = cleaned.replaceAll(token, "[REDACTED]");
  }
  return redactBasicAuthInUrl(cleaned);
}

function parseEnvelope<T>(
  payload: unknown,
  status: number,
  token: string
): Result<T, RedisRestTransportError> {
  if (typeof payload !== "object" || payload === null) {
    return {
      error: {
        code: "invalid_response",
        message: redactCredentials(
          "Malformed Redis REST response envelope",
          token
        ),
        status,
      },
      ok: false,
    };
  }

  if (
    "error" in payload &&
    typeof (payload as { error: unknown }).error === "string"
  ) {
    const errorMessage = (payload as { error: string }).error;
    return {
      error: {
        code: status >= 400 ? "http_error" : "redis_error",
        message: redactCredentials(errorMessage, token),
        status,
      },
      ok: false,
    };
  }

  if ("result" in payload) {
    return {
      ok: true,
      value: (payload as { result: T }).result,
    };
  }

  return {
    error: {
      code: "invalid_response",
      message: redactCredentials(
        "Malformed Redis REST response envelope",
        token
      ),
      status,
    },
    ok: false,
  };
}

function mapFetchError(
  error: unknown,
  combinedSignal: AbortSignal | undefined,
  token: string
): Result<never, RedisRestTransportError> {
  const isTimeout =
    (error instanceof Error &&
      (error.name === "TimeoutError" ||
        (error.name === "AbortError" && Boolean(combinedSignal?.aborted)))) ||
    Boolean(
      combinedSignal?.aborted &&
        (combinedSignal.reason as { name?: string } | undefined)?.name ===
          "TimeoutError"
    );

  if (isTimeout) {
    return {
      error: {
        code: "timeout",
        message: "Redis REST request timed out",
      },
      ok: false,
    };
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : "Network error during Redis REST request";
  return {
    error: {
      code: "network_error",
      message: redactCredentials(rawMessage, token),
    },
    ok: false,
  };
}

interface TimeoutControllerState {
  cleanup: () => void;
  signal?: AbortSignal;
}

function setupTimeoutSignal(
  timeoutMs: number | undefined,
  inputSignal: AbortSignal | undefined
): TimeoutControllerState {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      cleanup: () => {
        // No timeout timer was started.
      },
      signal: inputSignal,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new DOMException("The operation timed out", "TimeoutError")
    );
  }, timeoutMs);

  const onAbort = () => controller.abort(inputSignal?.reason);
  if (inputSignal) {
    if (inputSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(inputSignal.reason);
    } else {
      inputSignal.addEventListener("abort", onAbort);
    }
  }

  return {
    cleanup: () => {
      clearTimeout(timeoutId);
      inputSignal?.removeEventListener("abort", onAbort);
    },
    signal: controller.signal,
  };
}

export async function executeRedisRestCommand<T = unknown>(
  input: ExecuteRedisRestCommandInput
): Promise<Result<T, RedisRestTransportError>> {
  const { command, token, url } = input;
  const customFetch = input.fetch ?? fetch;

  if (input.signal?.aborted) {
    return {
      error: {
        code: "aborted",
        message: redactCredentials(
          input.signal.reason instanceof Error
            ? input.signal.reason.message
            : "Request was aborted",
          token
        ),
      },
      ok: false,
    };
  }

  const { cleanup, signal } = setupTimeoutSignal(input.timeoutMs, input.signal);

  try {
    const response = await customFetch(url, {
      body: JSON.stringify(command),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal,
    });

    let payload: unknown;
    try {
      payload = JSON.parse(await readResponseText(response, signal));
    } catch (parseError) {
      if (signal?.aborted) {
        return cancellationResult(input.signal);
      }
      const parseMessage =
        parseError instanceof Error
          ? parseError.message
          : "Invalid JSON response";
      return {
        error: {
          code: "invalid_response",
          message: redactCredentials(
            `Failed to parse Redis REST response: ${parseMessage}`,
            token
          ),
          status: response.status,
        },
        ok: false,
      };
    }

    if (
      !response.ok &&
      (typeof payload !== "object" || payload === null || !("error" in payload))
    ) {
      return {
        error: {
          code: "http_error",
          message: redactCredentials(
            `Redis REST command failed with HTTP ${response.status}`,
            token
          ),
          status: response.status,
        },
        ok: false,
      };
    }

    return parseEnvelope<T>(payload, response.status, token);
  } catch (error) {
    if (signal?.aborted) {
      return cancellationResult(input.signal);
    }
    return mapFetchError(error, signal, token);
  } finally {
    cleanup();
  }
}

function cancellationResult(
  callerSignal?: AbortSignal
): Result<never, RedisRestTransportError> {
  return {
    error: {
      code: callerSignal?.aborted ? "aborted" : "timeout",
      message: callerSignal?.aborted
        ? "Redis REST request was aborted"
        : "Redis REST request timed out",
    },
    ok: false,
  };
}

async function readResponseText(
  response: Response,
  signal?: AbortSignal
): Promise<string> {
  if (!signal) {
    return response.text();
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  let onAbort: () => void = () => {
    /* Assigned synchronously below. */
  };
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      reader.cancel().catch(() => {
        /* Body cancellation may race closure. */
      });
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort);
    }
  });
  try {
    const decoder = new TextDecoder();
    let text = "";
    let complete = false;
    while (!complete) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) {
        complete = true;
      } else {
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
