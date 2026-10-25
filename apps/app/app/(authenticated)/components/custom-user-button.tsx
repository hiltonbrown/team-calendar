"use client";

import { AccountUserMenu } from "@repo/auth/client";
import { Users } from "lucide-react";

export const CustomUserButton = () => (
  <AccountUserMenu accountProfileIcon={<Users className="h-4 w-4" />} />
);
