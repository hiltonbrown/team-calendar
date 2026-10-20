import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Server Components and server actions run in the unit harness as well as client components.
vi.mock("server-only", () => ({}));

// Unmount client effects before Vitest disposes each jsdom environment.
afterEach(cleanup);
