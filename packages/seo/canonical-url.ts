const DEFAULT_WEB_URL = "http://localhost:3001";

interface CanonicalWebUrlOptions {
  readonly fallbackUrl?: string;
  readonly vercelProjectProductionUrl?: string;
  readonly webUrl?: string;
}

const withProtocol = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const parseOrigin = (value: string | undefined): URL | undefined => {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    return new URL(url.origin);
  } catch {
    return;
  }
};

export const resolveCanonicalWebUrl = (
  options: CanonicalWebUrlOptions = {}
): URL => {
  const candidates = [
    options.webUrl ?? process.env.NEXT_PUBLIC_WEB_URL,
    withProtocol(
      options.vercelProjectProductionUrl ??
        process.env.VERCEL_PROJECT_PRODUCTION_URL
    ),
    options.fallbackUrl ?? DEFAULT_WEB_URL,
  ];

  for (const candidate of candidates) {
    const parsed = parseOrigin(candidate);

    if (parsed) {
      return parsed;
    }
  }

  return new URL(DEFAULT_WEB_URL);
};
