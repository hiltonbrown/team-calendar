"use client";

import type { ReactNode } from "react";

export const accountPickerUrl = "/select-account";

// Better Auth's reactive client owns its stores and needs no SDK provider.
export const AuthProvider = ({ children }: { children: ReactNode }) => children;
