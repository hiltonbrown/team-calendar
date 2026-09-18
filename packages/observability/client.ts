/*
 * This file configures the initialization of Sentry on the client.
 * The config you add here will be used whenever a users loads a page in their browser.
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

// biome-ignore lint/performance/noNamespaceImport: Sentry SDK convention
import * as Sentry from "@sentry/nextjs";
import { keys } from "./keys";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from "./scrubber";

export const initializeSentry = (): ReturnType<typeof Sentry.init> =>
  Sentry.init({
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSend: scrubSentryEvent,
    beforeSendLog: scrubSentryLog,
    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
    dsn: keys().NEXT_PUBLIC_SENTRY_DSN,

    // Enable logging
    enableLogs: true,

    // You can remove this option if you're not planning to use the Sentry Session Replay feature:
    integrations: [
      Sentry.replayIntegration({
        blockAllMedia: true,
        // Additional Replay configuration goes in here, for example:
        maskAllText: true,
      }),
    ],

    replaysOnErrorSampleRate: 1,

    /*
     * This sets the sample rate to be 10%. You may want this to be 100% while
     * in development and sample at a lower rate in production
     */
    replaysSessionSampleRate: 0.1,

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1,
  });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
