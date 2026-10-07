export const SUPPORTED_GLOBAL_KEY_PREFIXES = [
  "fixture-namespace:",
  "plan_id:",
  "plan_key:",
  "stripe_event:",
  "authorisation:",
  "provider_app:",
  "shared_store_namespace:",
] as const;

export const isSupportedGlobalFixtureKey = (key: string): boolean =>
  SUPPORTED_GLOBAL_KEY_PREFIXES.some(
    (prefix) => key.startsWith(prefix) && key.length > prefix.length
  );

export const unsupportedGlobalFixtureKeys = (
  keys: readonly string[]
): string[] => keys.filter((key) => !isSupportedGlobalFixtureKey(key));
