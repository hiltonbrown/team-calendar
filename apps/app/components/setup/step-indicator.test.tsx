import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StepIndicator } from "./step-indicator";

const steps = [
  { id: "details", label: "Organisation" },
  { id: "xero", label: "Xero" },
  { id: "people", label: "People" },
];

describe("StepIndicator", () => {
  afterEach(cleanup);

  it("renders an ordered list with the current step marked", () => {
    render(
      <StepIndicator
        completedIds={["details"]}
        currentId="xero"
        steps={steps}
      />
    );
    const nav = screen.getByRole("navigation", { name: "Setup progress" });
    expect(within(nav).getByText("Step 2 of 3")).toBeTruthy();
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(nav.querySelector("ol")).toBeTruthy();
    expect(items[1]?.getAttribute("aria-current")).toBe("step");
    expect(items[0]?.getAttribute("aria-current")).toBeNull();
  });

  it("labels completed steps for screen readers", () => {
    render(
      <StepIndicator
        completedIds={["details"]}
        currentId="xero"
        steps={steps}
      />
    );
    expect(
      screen.getByText("Organisation").parentElement?.textContent
    ).toContain("completed");
    expect(screen.getByText("People").parentElement?.textContent).not.toContain(
      "completed"
    );
  });
});
