import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import Page from "../app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page";

test("Sign In Page", () => {
  const { container } = render(<Page />);
  expect(container).toBeDefined();
});
