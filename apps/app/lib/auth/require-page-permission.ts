import "server-only";

import type { PermissionRequest } from "@repo/auth/permissions";
import { hasPermission } from "@repo/auth/server";

export class PermissionDeniedError extends Error {
  constructor() {
    super("Permission denied");
    this.name = "PermissionDeniedError";
  }
}

export async function requirePagePermission(
  request: PermissionRequest
): Promise<void> {
  if (!(await hasPermission(request))) {
    throw new PermissionDeniedError();
  }
}

export const hasPagePermission = hasPermission;
