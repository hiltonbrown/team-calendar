import type { ReactNode } from "react";

interface UnauthenticatedLayoutProps {
  readonly children: ReactNode;
}

// Pass-through for the public area. Each subgroup supplies its own chrome:
// (auth) renders the brand-panel sign-in shell, (legal) renders a readable
// document layout. Keeping this thin lets them diverge without coupling.
const UnauthenticatedLayout = ({ children }: UnauthenticatedLayoutProps) =>
  children;

export default UnauthenticatedLayout;
