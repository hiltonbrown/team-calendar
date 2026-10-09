import { describe, expect, it } from "vitest";
import { resolveOnboardingRedirect } from "./onboarding-gate";

const base = {
  orgRole: "org:admin",
  pathname: "/",
  welcomeEligible: false,
  wizardCompleted: false,
};

describe("resolveOnboardingRedirect", () => {
  it.each(["/", "/calendar", "/settings/general", "/feeds/abc"])(
    "sends an admin with an unfinished wizard from %s to onboarding",
    (pathname) => {
      expect(resolveOnboardingRedirect({ ...base, pathname })).toBe(
        "/onboarding"
      );
    }
  );

  it.each(["org:owner", "owner", "admin"])(
    "treats %s as an admin",
    (orgRole) => {
      expect(resolveOnboardingRedirect({ ...base, orgRole })).toBe(
        "/onboarding"
      );
    }
  );

  it.each([
    "/settings/integrations/xero/connect",
    "/settings/integrations/xero/connect/select",
    "/settings/integrations/xero/matches",
  ])("lets the wizard's Xero pages through at %s", (pathname) => {
    expect(resolveOnboardingRedirect({ ...base, pathname })).toBeNull();
  });

  it("does not treat a lookalike path as exempt", () => {
    expect(
      resolveOnboardingRedirect({
        ...base,
        pathname: "/settings/integrations/xero/connections",
      })
    ).toBe("/onboarding");
  });

  it("leaves an admin alone once the wizard is complete", () => {
    expect(
      resolveOnboardingRedirect({ ...base, wizardCompleted: true })
    ).toBeNull();
  });

  it("never sends an admin to the member welcome", () => {
    expect(
      resolveOnboardingRedirect({
        ...base,
        welcomeEligible: true,
        wizardCompleted: true,
      })
    ).toBeNull();
  });

  it.each(["org:manager", "org:viewer"])(
    "never blocks %s on the organisation wizard",
    (orgRole) => {
      expect(
        resolveOnboardingRedirect({ ...base, orgRole, wizardCompleted: false })
      ).toBeNull();
    }
  );

  it("sends an eligible member to the welcome once", () => {
    expect(
      resolveOnboardingRedirect({
        ...base,
        orgRole: "org:viewer",
        welcomeEligible: true,
      })
    ).toBe("/welcome");
  });

  it("does not redirect without an organisation role", () => {
    expect(
      resolveOnboardingRedirect({
        ...base,
        orgRole: null,
        welcomeEligible: true,
      })
    ).toBeNull();
  });
});
