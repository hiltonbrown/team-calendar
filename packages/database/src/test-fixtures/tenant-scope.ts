// Unit fixtures open real branded scopes while substituting only the pool.
export const tenantTestAccount = (input: unknown): string => {
  if (typeof input === "string" && input.trim()) {
    return input;
  }
  if (typeof input === "object" && input !== null) {
    for (const key of ["accountId", "account_id"] as const) {
      if (key in input) {
        const value = Reflect.get(input, key);
        if (typeof value === "string" && value.trim()) {
          return value;
        }
      }
    }
    if ("xeroConnection" in input) {
      return tenantTestAccount(input.xeroConnection);
    }
  }
  // Invalid-input cases still need a valid entry-point scope for schema checks.
  return "unit-test-account";
};
