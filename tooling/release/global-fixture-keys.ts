export const SUPPORTED_GLOBAL_KEY_PREFIXES = [
  "fixture-namespace:",
  "plan_id:",
  "plan_key:",
  "stripe_event:",
  "credential_owner:",
  "provider_app:",
  "provider_connection:",
  "tenant_binding:",
  "oauth_attempt:",
  "cleanup_request:",
  "cleanup_attempt:",
  "shared_store_namespace:",
] as const;

export const isSupportedGlobalFixtureKey = (key: string): boolean =>
  SUPPORTED_GLOBAL_KEY_PREFIXES.some(
    (prefix) => key.startsWith(prefix) && key.length > prefix.length
  );

export const unsupportedGlobalFixtureKeys = (
  keys: readonly string[]
): string[] => keys.filter((key) => !isSupportedGlobalFixtureKey(key));
