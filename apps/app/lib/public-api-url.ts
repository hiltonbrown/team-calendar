const LOCAL_API_ORIGIN = "http://localhost:3002";
const TRAILING_SLASHES_PATTERN = /\/+$/;

export function getPublicApiOrigin(): string | null {
  const configuredOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configuredOrigin) {
    return configuredOrigin.replace(TRAILING_SLASHES_PATTERN, "");
  }

  if (process.env.NODE_ENV === "development") {
    return LOCAL_API_ORIGIN;
  }

  return null;
}

export function getPublicApiUrl(path: `/${string}`): string | null {
  const origin = getPublicApiOrigin();

  return origin ? `${origin}${path}` : null;
}

/** Unrelated HTTPS Preview hosts need the app's fixed same-path proxy. */
export function getBrowserApiUrl(path: `/${string}`): string | null {
  const apiOrigin = getPublicApiOrigin();
  if (!apiOrigin) {
    return null;
  }
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (appOrigin) {
    const app = new URL(appOrigin);
    const api = new URL(apiOrigin);
    const production =
      app.origin === "https://app.teamcalendar.online" &&
      api.origin === "https://api.teamcalendar.online";
    if (
      app.protocol === "https:" &&
      app.hostname !== api.hostname &&
      !production
    ) {
      return path;
    }
  }
  return `${apiOrigin}${path}`;
}
