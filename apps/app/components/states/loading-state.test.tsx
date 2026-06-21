import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./loading-state";

describe("LoadingState", () => {
  it("renders correctly", () => {
    render(<LoadingState />);

    expect(screen.getByText("Loading workspace")).toBeDefined();
    expect(screen.getByRole("status")).toBeDefined();
  });
});
