import { describe, expect, it } from "vitest";
import { type HelpRole, helpPhases, helpSupport, helpTasks } from "./content";

const mailtoPattern = /^mailto:support@teamcalendar\.online\?/;
const shippedRoles = new Set<HelpRole>(["Owner", "Admin", "Manager", "Viewer"]);

describe("help content contract", () => {
  it("keeps four extensible phases and eight uniquely anchored steps", () => {
    const steps = helpPhases.flatMap((phase) => phase.steps);
    const anchors = steps.map((step) => step.anchor);

    expect(helpPhases).toHaveLength(4);
    expect(steps).toHaveLength(8);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(helpTasks).toHaveLength(4);
  });

  it("uses only shipped roles and valid support destinations", () => {
    const roles = helpPhases.flatMap((phase) =>
      phase.steps.flatMap((step) => step.roles)
    );

    expect(roles.every((role) => shippedRoles.has(role))).toBe(true);
    expect(helpSupport.email).toBe("support@teamcalendar.online");
    expect(helpSupport.mailtoHref).toMatch(mailtoPattern);
  });
});
