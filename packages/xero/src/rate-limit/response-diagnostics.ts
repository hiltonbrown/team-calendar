const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function getXeroCorrelationId(headers: Headers): string | undefined {
  for (const name of ["xero-correlation-id", "x-correlation-id"]) {
    const value = headers.get(name);
    if (value && SAFE_CORRELATION_ID.test(value)) {
      return value;
    }
  }
  return undefined;
}
