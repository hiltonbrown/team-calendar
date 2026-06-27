import { env } from "@/env";

const PRODUCTION_APP_ORIGIN = "https://app.teamcalendar.online";
const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const resolveAppOrigin = (): string => {
  const configuredUrl = env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_APP_ORIGIN;
  const appUrl = new URL(configuredUrl);

  if (
    process.env.NODE_ENV === "production" &&
    LOCAL_APP_HOSTS.has(appUrl.hostname)
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must point to the Team Calendar app domain in production."
    );
  }

  return appUrl.origin;
};

const appOrigin = resolveAppOrigin();

export const signInHref = `${appOrigin}/sign-in`;
export const signUpHref = `${appOrigin}/sign-up`;
