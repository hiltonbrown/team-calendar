export type AuthSearchParams = Record<string, string | string[] | undefined>;
export interface AuthPageProperties {
  searchParams: Promise<AuthSearchParams>;
}

export function authSearchParam(
  values: AuthSearchParams,
  key: string
): string | undefined {
  return typeof values[key] === "string" ? values[key] : undefined;
}
