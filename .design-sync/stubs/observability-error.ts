// Stub for design-sync bundling only — see .design-sync/NOTES.md ("Sentry
// import blocks browser bundling"). Never shipped to the real app; only
// used via .design-sync/tsconfig.json's path alias so this preview bundle
// doesn't need to resolve @sentry/nextjs (which pulls in Node-only code
// through next/router that plain esbuild can't bundle for a browser target).
export const parseError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
