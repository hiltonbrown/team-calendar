"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cloneElement,
  isValidElement,
  type MouseEventHandler,
  type ReactNode,
  useState,
} from "react";
import {
  signOut,
  useActiveOrganization,
  useSession,
} from "../adapters/better-auth-client";
import { hasPermission } from "../permissions";

export interface AccountUserMenuProperties {
  accountProfileIcon?: ReactNode;
  accountProfileLabel?: string;
}

function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await signOut();
    if (result.error) {
      setError("Could not sign out. Try again.");
      setPending(false);
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  };
  return { error, pending, run };
}

export const AccountUserMenu = ({
  accountProfileIcon,
  accountProfileLabel = "Account settings",
}: AccountUserMenuProperties = {}) => {
  const { isLoaded, session, user } = useSession();
  const { organization } = useActiveOrganization();
  const { pending, error, run } = useSignOut();
  const name = user?.name || user?.email || "Your profile";
  const initials = (user?.name || user?.email || "TC")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Open user menu"
            disabled={!(isLoaded && user)}
            size="icon"
            variant="ghost"
          >
            <Avatar>
              {user?.image ? <AvatarImage alt="" src={user.image} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-lg p-2">
          <DropdownMenuLabel className="space-y-1 break-words px-2 py-2">
            <span className="block text-foreground">{name}</span>
            {organization ? (
              <span className="block font-normal text-muted-foreground text-xs">
                {organization.name}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href="/select-account">Switch account</Link>
          </DropdownMenuItem>
          {hasPermission(session?.role, { settings: ["update"] }) ? (
            <DropdownMenuItem asChild>
              <Link href="/settings/general">
                {accountProfileIcon}
                {accountProfileLabel}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={pending}
            onSelect={async (event) => {
              event.preventDefault();
              await run();
            }}
          >
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

interface SignOutChildProperties {
  "aria-busy"?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
}
export const SignOutButton = ({ children }: { children: ReactNode }) => {
  const { error, pending, run } = useSignOut();
  const onClick: MouseEventHandler<HTMLElement> = async (event) => {
    event.preventDefault();
    await run();
  };
  return (
    <>
      {isValidElement<SignOutChildProperties>(children) ? (
        cloneElement(children, {
          "aria-busy": pending,
          disabled: pending,
          onClick,
        })
      ) : (
        <Button
          aria-busy={pending}
          disabled={pending}
          onClick={onClick}
          variant="ghost"
        >
          {children}
        </Button>
      )}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
};
