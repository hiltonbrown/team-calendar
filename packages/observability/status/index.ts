import "server-only";
import type { Result } from "@repo/core";
import { type BetterStackConfiguration, keys } from "../keys";
import {
  type StatusPageResourceResponse,
  type StatusReportResponse,
  type StatusUpdateResponse,
  statusPageResourcesResponseSchema,
  statusPageResponseSchema,
  statusReportsResponseSchema,
  statusUpdatesResponseSchema,
} from "./schemas";
import {
  type PublicComponentName,
  type PublicComponentState,
  type PublicIncidentState,
  type PublicOverallState,
  type PublicStatusComponent,
  type PublicStatusError,
  type PublicStatusErrorCode,
  type PublicStatusIncident,
  type PublicStatusSnapshot,
  publicComponentNames,
} from "./types";

const apiBaseUrl = "https://uptime.betterstack.com/api/v2";
const defaultTimeoutMs = 5000;
type StatusFetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;
interface PublicStatusOptions {
  configuration?: BetterStackConfiguration;
  fetcher?: StatusFetcher;
  now?: () => Date;
  timeoutMs?: number;
}
interface ProviderRequestError {
  code: PublicStatusErrorCode;
}

const safeErrorMessages: Record<PublicStatusErrorCode, string> = {
  authentication: "Status information is temporarily unavailable.",
  configuration: "Live status information has not been configured.",
  invalid_response: "Status information is temporarily unavailable.",
  network: "Status information is temporarily unavailable.",
  not_found: "Status information is temporarily unavailable.",
  provider: "Status information is temporarily unavailable.",
  rate_limit: "Status information is temporarily unavailable.",
  timeout: "Status information is taking too long to respond.",
  unknown: "Status information is temporarily unavailable.",
};

const failure = (
  code: PublicStatusErrorCode,
  hostedStatusPageUrl?: string
): Result<never, PublicStatusError> => ({
  error: { code, hostedStatusPageUrl, message: safeErrorMessages[code] },
  ok: false,
});
const isProviderRequestError = (
  error: unknown
): error is ProviderRequestError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string";
const providerErrorForStatus = (status: number): ProviderRequestError => {
  if (status === 401 || status === 403) {
    return { code: "authentication" };
  }
  if (status === 404) {
    return { code: "not_found" };
  }
  if (status === 429) {
    return { code: "rate_limit" };
  }
  return { code: "provider" };
};

const readJson = async (
  fetcher: StatusFetcher,
  url: string,
  apiKey: string,
  timeoutMs: number
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw providerErrorForStatus(response.status);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw { code: "timeout" } satisfies ProviderRequestError;
    }
    if (isProviderRequestError(error)) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw { code: "invalid_response" } satisfies ProviderRequestError;
    }
    throw { code: "network" } satisfies ProviderRequestError;
  } finally {
    clearTimeout(timeout);
  }
};

export const normaliseComponentState = (
  state: string | undefined
): PublicComponentState => {
  if (
    state === "operational" ||
    state === "degraded" ||
    state === "maintenance"
  ) {
    return state;
  }
  if (state === "downtime") {
    return "outage";
  }
  return "unknown";
};

export const deriveOverallState = (
  components: PublicStatusComponent[]
): PublicOverallState => {
  const states = components.map(({ state }) => state);
  if (
    components.length !== publicComponentNames.length ||
    states.includes("unknown")
  ) {
    return "unknown";
  }
  const outageCount = states.filter((state) => state === "outage").length;
  if (outageCount === publicComponentNames.length) {
    return "major_outage";
  }
  if (outageCount > 0) {
    return "partial_outage";
  }
  if (states.includes("degraded")) {
    return "degraded";
  }
  if (states.includes("maintenance")) {
    return "maintenance";
  }
  return states.every((state) => state === "operational")
    ? "operational"
    : "unknown";
};

const normaliseComponents = (
  resources: StatusPageResourceResponse[]
): PublicStatusComponent[] =>
  publicComponentNames.map((name) => {
    const matches = resources.filter(
      (resource) => resource.attributes.public_name === name
    );
    return {
      name,
      state: normaliseComponentState(
        matches.length === 1 ? matches[0]?.attributes.status : undefined
      ),
    };
  });
const isResolved = (report: StatusReportResponse): boolean =>
  report.attributes.ends_at !== null ||
  report.attributes.aggregate_state === "resolved";
const reportTime = (report: StatusReportResponse): number =>
  Date.parse(report.attributes.ends_at ?? report.attributes.starts_at);
const selectReports = (reports: StatusReportResponse[]) => {
  const active = reports
    .filter((report) => !isResolved(report))
    .sort((a, b) => reportTime(b) - reportTime(a))
    .slice(0, 3);
  const recent = reports
    .filter(isResolved)
    .sort((a, b) => reportTime(b) - reportTime(a))
    .slice(0, 10);
  return { active, recent };
};
const affectedComponents = (
  report: StatusReportResponse,
  namesById: Map<string, string>
): PublicComponentName[] => {
  const names = new Set(
    report.attributes.affected_resources
      .map(({ status_page_resource_id }) =>
        namesById.get(status_page_resource_id)
      )
      .filter((name): name is PublicComponentName =>
        publicComponentNames.some((publicName) => publicName === name)
      )
  );
  return publicComponentNames.filter((name) => names.has(name));
};
const normaliseIncident = (
  report: StatusReportResponse,
  updates: StatusUpdateResponse[],
  namesById: Map<string, string>
): PublicStatusIncident => {
  let state: PublicIncidentState = "active";
  if (isResolved(report)) {
    state = "resolved";
  } else if (report.attributes.report_type === "maintenance") {
    state = "maintenance";
  }
  return {
    affectedComponents: affectedComponents(report, namesById),
    resolvedAt: report.attributes.ends_at,
    startedAt: report.attributes.starts_at,
    state,
    title: report.attributes.title,
    updates: updates
      .map(({ attributes }) => ({
        message: attributes.message,
        publishedAt: attributes.published_at,
      }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
  };
};

const latestIncidentTime = (incident: PublicStatusIncident): number =>
  Date.parse(incident.updates[0]?.publishedAt ?? incident.startedAt);

export const getPublicStatus = async (
  options: PublicStatusOptions = {}
): Promise<Result<PublicStatusSnapshot, PublicStatusError>> => {
  let configuration: BetterStackConfiguration;
  try {
    configuration = options.configuration ?? keys();
  } catch {
    return failure("configuration");
  }
  const apiKey = configuration.BETTERSTACK_API_KEY;
  const pageId = configuration.BETTERSTACK_STATUS_PAGE_ID;
  const hostedStatusPageUrl = configuration.BETTERSTACK_STATUS_PAGE_URL;
  if (!(apiKey && pageId && hostedStatusPageUrl)) {
    return failure("configuration");
  }
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const pageUrl = `${apiBaseUrl}/status-pages/${encodeURIComponent(pageId)}`;
  try {
    const [pagePayload, resourcesPayload, reportsPayload] = await Promise.all([
      readJson(fetcher, pageUrl, apiKey, timeoutMs),
      readJson(fetcher, `${pageUrl}/resources`, apiKey, timeoutMs),
      readJson(fetcher, `${pageUrl}/status-reports`, apiKey, timeoutMs),
    ]);
    const page = statusPageResponseSchema.safeParse(pagePayload);
    const resources =
      statusPageResourcesResponseSchema.safeParse(resourcesPayload);
    const reports = statusReportsResponseSchema.safeParse(reportsPayload);
    if (!(page.success && resources.success && reports.success)) {
      return failure("invalid_response");
    }

    const components = page.data.data.attributes.published
      ? normaliseComponents(resources.data.data)
      : publicComponentNames.map((name) => ({
          name,
          state: "unknown" as const,
        }));
    const selected = selectReports(reports.data.data);
    const displayed = [...selected.active, ...selected.recent];
    const namesById = new Map(
      resources.data.data.map((resource) => [
        resource.id,
        resource.attributes.public_name,
      ])
    );
    const updateResults = await Promise.allSettled(
      displayed.map(async (report) => {
        const payload = await readJson(
          fetcher,
          `${pageUrl}/status-reports/${encodeURIComponent(report.id)}/status-updates`,
          apiKey,
          timeoutMs
        );
        const parsed = statusUpdatesResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw { code: "invalid_response" } satisfies ProviderRequestError;
        }
        return parsed.data.data;
      })
    );
    const updatesAvailable = updateResults.every(
      (result) => result.status === "fulfilled"
    );
    const normalised = updatesAvailable
      ? displayed.map((report, index) =>
          normaliseIncident(
            report,
            updateResults[index]?.status === "fulfilled"
              ? updateResults[index].value
              : [],
            namesById
          )
        )
      : [];
    const activeIncidents = updatesAvailable
      ? normalised
          .slice(0, selected.active.length)
          .sort(
            (left, right) =>
              latestIncidentTime(right) - latestIncidentTime(left)
          )
      : [];
    return {
      ok: true,
      value: {
        activeIncidents,
        checkedAt: (options.now ?? (() => new Date()))().toISOString(),
        components,
        hostedStatusPageUrl,
        incidentAvailability: updatesAvailable ? "available" : "unavailable",
        overallState: deriveOverallState(components),
        recentIncidents: updatesAvailable
          ? normalised.slice(selected.active.length)
          : [],
        subscribable:
          page.data.data.attributes.published &&
          page.data.data.attributes.subscribable,
      },
    };
  } catch (error) {
    return failure(
      isProviderRequestError(error) ? error.code : "unknown",
      hostedStatusPageUrl
    );
  }
};

export type {
  PublicComponentName,
  PublicComponentState,
  PublicIncidentState,
  PublicOverallState,
  PublicStatusComponent,
  PublicStatusError,
  PublicStatusIncident,
  PublicStatusSnapshot,
} from "./types";
export { publicComponentNames } from "./types";
