import { redirect } from "next/navigation";
import { buildLegacySetupRedirect } from "./_legacy-redirect";

interface SetupRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SetupPage({ searchParams }: SetupRedirectProps) {
  redirect(buildLegacySetupRedirect(await searchParams));
}
