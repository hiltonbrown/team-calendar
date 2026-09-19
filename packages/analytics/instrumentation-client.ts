import { keys } from "./keys";

declare global {
  interface Window {
    __teamCalendarAnalyticsCleanup?: () => void;
  }
}

interface PostHogClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  group: (
    groupType: string,
    groupKey: string,
    properties?: Record<string, unknown>
  ) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  init: (key: string, options: Record<string, unknown>) => void;
}

interface PageView {
  readonly referrer: string;
  readonly url: string;
}

interface AnalyticsEvent {
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

type Association =
  | {
      readonly kind: "identify";
      readonly distinctId: string;
      readonly properties: Record<string, unknown> | undefined;
    }
  | {
      readonly kind: "group";
      readonly groupKey: string;
      readonly groupType: string;
      readonly properties: Record<string, unknown> | undefined;
    };

let analyticsClient: PostHogClient | undefined;
let initializationPromise: Promise<void> | undefined;
const pendingAssociations: Association[] = [];
let analyticsState: "idle" | "loading" | "ready" | "disabled" = "idle";
const MAX_PENDING_ASSOCIATIONS = 100;
const MAX_PENDING_PAGE_VIEWS = 50;

const sanitiseUrl = (value: string): string => {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
};

const sanitiseEventUrls = (
  event: AnalyticsEvent | null
): AnalyticsEvent | null => {
  if (!event) {
    return event;
  }
  const sanitiseUrlContainer = (value: unknown): unknown => {
    if (!(value && typeof value === "object") || Array.isArray(value)) {
      return value;
    }
    const nested = { ...(value as Record<string, unknown>) };
    for (const key of [
      "$current_url",
      "$initial_current_url",
      "$initial_referrer",
      "$referrer",
      "$session_entry_url",
    ]) {
      if (typeof nested[key] === "string") {
        nested[key] = sanitiseUrl(nested[key]);
      }
    }
    return nested;
  };
  const sanitisedEvent = { ...event };
  for (const containerKey of ["$set", "$set_once"]) {
    sanitisedEvent[containerKey] = sanitiseUrlContainer(
      sanitisedEvent[containerKey]
    );
  }
  if (!event.properties) {
    return sanitisedEvent;
  }
  const properties = { ...event.properties };
  for (const key of [
    "$current_url",
    "$referrer",
    "$initial_current_url",
    "$session_entry_url",
  ]) {
    const value = properties[key];
    if (typeof value === "string") {
      properties[key] = sanitiseUrl(value);
    }
  }
  for (const containerKey of ["$set", "$set_once"]) {
    properties[containerKey] = sanitiseUrlContainer(properties[containerKey]);
  }
  return { ...sanitisedEvent, properties };
};

const scheduleAfterHydration = (callback: () => void) => {
  const scheduleIdle = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 2000 });
      return;
    }
    globalThis.setTimeout(callback, 0);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleIdle, { once: true });
    return;
  }
  scheduleIdle();
};

const capturePageView = (client: PostHogClient, pageView: PageView) => {
  client.capture("$pageview", {
    $current_url: pageView.url,
    $referrer: pageView.referrer,
  });
};

const observeNavigation = (initialPageView: PageView) => {
  window.__teamCalendarAnalyticsCleanup?.();
  const pendingPageViews: PageView[] = [];
  let previousUrl = initialPageView.url;
  const recordPageView = () => {
    const url = sanitiseUrl(window.location.href);
    if (url === previousUrl) {
      return;
    }
    const pageView = { referrer: previousUrl, url };
    previousUrl = url;
    if (analyticsState === "disabled") {
      return;
    }
    if (analyticsClient) {
      capturePageView(analyticsClient, pageView);
    } else {
      if (pendingPageViews.length === MAX_PENDING_PAGE_VIEWS) {
        pendingPageViews.shift();
      }
      pendingPageViews.push(pageView);
    }
  };
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  for (const [method, original] of [
    ["pushState", originalPushState],
    ["replaceState", originalReplaceState],
  ] as const) {
    window.history[method] = (...arguments_) => {
      original(...arguments_);
      recordPageView();
    };
  }
  window.addEventListener("popstate", recordPageView);
  window.__teamCalendarAnalyticsCleanup = () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", recordPageView);
    window.__teamCalendarAnalyticsCleanup = undefined;
  };
  return pendingPageViews;
};

const applyPendingAssociations = (client: PostHogClient) => {
  for (const association of pendingAssociations.splice(0)) {
    if (association.kind === "identify") {
      client.identify(association.distinctId, association.properties);
    } else {
      client.group(
        association.groupType,
        association.groupKey,
        association.properties
      );
    }
  }
};

export const identifyAnalytics = (
  distinctId: string,
  properties?: Record<string, unknown>
) => {
  if (analyticsState === "disabled") {
    return;
  }
  if (analyticsClient) {
    analyticsClient.identify(distinctId, properties);
    return;
  }
  if (pendingAssociations.length === MAX_PENDING_ASSOCIATIONS) {
    pendingAssociations.shift();
  }
  pendingAssociations.push({ distinctId, kind: "identify", properties });
};

export const groupAnalytics = (
  groupType: string,
  groupKey: string,
  properties?: Record<string, unknown>
) => {
  if (analyticsState === "disabled") {
    return;
  }
  if (analyticsClient) {
    analyticsClient.group(groupType, groupKey, properties);
    return;
  }
  if (pendingAssociations.length === MAX_PENDING_ASSOCIATIONS) {
    pendingAssociations.shift();
  }
  pendingAssociations.push({ groupKey, groupType, kind: "group", properties });
};

export const initializeAnalytics = (): Promise<void> => {
  if (initializationPromise) {
    return initializationPromise;
  }
  const { NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST } = keys();

  if (!(NEXT_PUBLIC_POSTHOG_KEY && NEXT_PUBLIC_POSTHOG_HOST)) {
    analyticsState = "disabled";
    pendingAssociations.splice(0);
    initializationPromise = Promise.resolve();
    return initializationPromise;
  }
  if (typeof window === "undefined") {
    analyticsState = "disabled";
    pendingAssociations.splice(0);
    initializationPromise = Promise.resolve();
    return initializationPromise;
  }

  const initialPageView = {
    referrer: sanitiseUrl(document.referrer),
    url: sanitiseUrl(window.location.href),
  };
  const pendingPageViews = observeNavigation(initialPageView);
  analyticsState = "loading";
  initializationPromise = new Promise((resolve) => {
    scheduleAfterHydration(() => {
      import("posthog-js")
        .then(({ default: posthog }) => {
          const client: PostHogClient = posthog;
          client.init(NEXT_PUBLIC_POSTHOG_KEY, {
            api_host: NEXT_PUBLIC_POSTHOG_HOST,
            autocapture: false,
            before_send: sanitiseEventUrls,
            capture_pageleave: false,
            capture_pageview: false,
            defaults: "2025-05-24",
            disable_session_recording: true,
            save_campaign_params: false,
            save_referrer: false,
          });
          analyticsClient = client;
          analyticsState = "ready";
          applyPendingAssociations(client);
          capturePageView(client, initialPageView);
          for (const pageView of pendingPageViews.splice(0)) {
            capturePageView(client, pageView);
          }
        })
        .catch(() => {
          analyticsState = "disabled";
          pendingAssociations.splice(0);
          pendingPageViews.splice(0);
          window.__teamCalendarAnalyticsCleanup?.();
        })
        .finally(resolve);
    });
  });

  return initializationPromise;
};
