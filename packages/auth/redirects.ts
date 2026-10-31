// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters that browsers strip from redirect URLs.
const unsafeCharacters = /[\u0000-\u0020\u007f\\]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Encoded control characters must not bypass redirect validation.
const unsafeDecodedCharacters = /[\u0000-\u001f\u007f\\]/;

function localPath(value: string | null | undefined): string | null {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    unsafeCharacters.test(value)
  ) {
    return null;
  }
  try {
    let decoded = value;
    for (let pass = 0; pass < 2; pass += 1) {
      decoded = decodeURIComponent(decoded);
      if (decoded.startsWith("//") || unsafeDecodedCharacters.test(decoded)) {
        return null;
      }
    }
    const url = new URL(value, "https://auth-return.invalid");
    return url.origin === "https://auth-return.invalid" ? value : null;
  } catch {
    return null;
  }
}

export function safeAuthReturnTo(
  value: string | null | undefined,
  fallback = "/"
): string {
  return localPath(value) ?? localPath(fallback) ?? "/";
}
