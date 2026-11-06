import { hasPermission } from "@repo/auth/permissions";

// The wizard sends admins through these Xero pages (choosing between several
// payroll files, reviewing matches), so they must not bounce back to it.
const WIZARD_EXEMPT_PATHS = [
  "/settings/integrations/xero/connect",
  "/settings/integrations/xero/matches",
];

function isExempt(pathname: string): boolean {
  return WIZARD_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function resolveOnboardingRedirect(input: {
  role: string | null | undefined;
  pathname: string;
  welcomeEligible: boolean;
  wizardCompleted: boolean;
}): "/onboarding" | "/welcome" | null {
  if (!input.role) {
    return null;
  }
  if (hasPermission(input.role, { settings: ["update"] })) {
    return input.wizardCompleted || isExempt(input.pathname)
      ? null
      : "/onboarding";
  }
  return input.welcomeEligible ? "/welcome" : null;
}
