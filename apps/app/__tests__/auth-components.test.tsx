import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { authCopy } from "../components/auth/auth-copy";
import { AuthFrame, AuthStatus } from "../components/auth/auth-form-elements";
import { authSearchParam } from "../components/auth/auth-page-params";

// Provider SDK widgets and appearance objects no longer form the public UI.
describe("custom authentication presentation", () => {
  it("uses the existing brand's hierarchy around custom controls", () => {
    render(
      <AuthFrame {...authCopy.signIn}>
        <div data-testid="custom-form" />
      </AuthFrame>
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" })
    ).toBeDefined();
    expect(screen.getByText(authCopy.signIn.description)).toBeDefined();
    expect(screen.getByTestId("custom-form")).toBeDefined();
  });
  it("announces confirmation through a status region", () => {
    render(<AuthStatus>Check your email for a sign-in link.</AuthStatus>);
    expect(screen.getByRole("status").textContent).toContain(
      "Check your email"
    );
  });
  it("keeps Account wording and the Australian signup scope", () => {
    expect(authCopy.signUp.title).toBe("Create your Account");
    expect(authCopy.signUp.description).toContain("Australian business");
  });
  it("accepts scalar page parameters and rejects duplicate or absent values", () => {
    expect(authSearchParam({ token: "one" }, "token")).toBe("one");
    expect(authSearchParam({ token: ["one", "two"] }, "token")).toBeUndefined();
    expect(authSearchParam({}, "token")).toBeUndefined();
  });
});
