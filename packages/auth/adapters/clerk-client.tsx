"use client";

import {
  SignOutButton as ClerkSignOutButton,
  UserButton,
  useAuth,
  useClerk,
} from "@clerk/nextjs";
import { createElement, type ReactElement, type ReactNode } from "react";
import type { AuthSession } from "../types";
import { fromClerkRole } from "./clerk-roles";

export const useSession = (): {
  session: AuthSession | null;
  isLoaded: boolean;
} => {
  const source = useAuth();
  return {
    isLoaded: source.isLoaded,
    session:
      source.isLoaded && source.isSignedIn && source.userId
        ? {
            accountId: source.orgId ?? null,
            role: fromClerkRole(source.orgRole),
            sessionId: source.sessionId ?? null,
            userId: source.userId,
          }
        : null,
  };
};

export interface AccountUserMenuProperties {
  accountProfileIcon?: ReactNode;
  accountProfileLabel?: string;
}

export const AccountUserMenu = ({
  accountProfileIcon,
  accountProfileLabel = "Organisation profile",
}: AccountUserMenuProperties = {}): ReactElement => {
  const { openOrganizationProfile } = useClerk();
  return createElement(
    UserButton,
    null,
    createElement(
      UserButton.MenuItems,
      null,
      createElement(UserButton.Action, {
        label: accountProfileLabel,
        labelIcon: accountProfileIcon,
        onClick: () => openOrganizationProfile(),
      })
    )
  );
};

export const SignOutButton = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => createElement(ClerkSignOutButton, null, children);
