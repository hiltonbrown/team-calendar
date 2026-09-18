/*
 * This file configures the initialization of Sentry on the server.
 * The config you add here will be used whenever the server handles a request.
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

    // Capture local variables in stack traces for better debugging
    includeLocalVariables: false,

    // Integrations for console logging
    integrations: [],

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1,
  });
