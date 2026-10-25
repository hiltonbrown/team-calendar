"use client";

import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  setActiveAccount,
  useListAccounts,
  useSession,
} from "../adapters/better-auth-client";
import { safeAuthReturnTo } from "../redirects";
import { AuthFormFrame } from "./auth-form-frame";

function accountActionLabel(
  accountId: string,
  currentId: string | null | undefined,
  pendingId: string | null,
  ready: boolean
) {
  if (!ready) {
    return "Setting up";
  }
  if (pendingId === accountId) {
    return "Opening…";
  }
  return accountId === currentId ? "Current" : "Open";
}

export function AccountPicker({ returnTo = "/" }: { returnTo?: string }) {
  const router = useRouter();
  const { accounts, error: listError, isLoaded, refetch } = useListAccounts();
  const { session, isLoaded: sessionLoaded } = useSession();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const automaticSelection = useRef<string | null>(null);
  const selectedDestination = safeAuthReturnTo(returnTo);
  const destination =
    new URL(selectedDestination, "https://auth-return.invalid").pathname ===
    "/select-account"
      ? "/"
      : selectedDestination;

  const select = useCallback(
    async (accountId: string) => {
      setPendingId(accountId);
      setError(null);
      const result = await setActiveAccount(accountId);
      if (result.error) {
        setError(
          "Could not switch accounts. Your access may have changed. Refresh the list and try again."
        );
        setPendingId(null);
        return;
      }
      // Native set-active confirms membership before navigation and invalidates
      // Better Auth's session and active-organisation stores.
      router.replace(destination);
      router.refresh();
    },
    [destination, router]
  );

  useEffect(() => {
    const [account] = accounts;
    if (
      isLoaded &&
      sessionLoaded &&
      !listError &&
      accounts.length === 1 &&
      account?.provisioningStatus === "ready" &&
      !session?.accountId &&
      !automaticSelection.current
    ) {
      automaticSelection.current = account.id;
      select(account.id).catch(() => {
        setError("Could not switch accounts. Refresh the list and try again.");
        setPendingId(null);
      });
    }
  }, [
    accounts,
    isLoaded,
    listError,
    select,
    session?.accountId,
    sessionLoaded,
  ]);

  return (
    <AuthFormFrame
      description="Choose the account you want to use. Each account keeps its people and calendar separate."
      title="Choose an account"
    >
      {isLoaded ? null : (
        <p className="text-muted-foreground text-sm" role="status">
          Loading your accounts…
        </p>
      )}
      {listError ? (
        <div className="space-y-3">
          <p className="text-destructive text-sm" role="alert">
            Could not load your accounts. Check your connection and try again.
          </p>
          <Button
            onClick={() => {
              refetch();
            }}
            variant="secondary"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {isLoaded && !listError && accounts.length === 0 ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            No account is available for this sign-in. Open your invitation, or
            ask your account owner to check your access.
          </p>
          <Button asChild variant="secondary">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </div>
      ) : null}
      {isLoaded && !listError && accounts.length > 0 ? (
        <ul aria-label="Your accounts" className="space-y-3">
          {accounts.map((account) => (
            <li key={account.id}>
              <Button
                aria-busy={pendingId === account.id}
                className="h-auto min-h-14 w-full justify-between whitespace-normal rounded-xl bg-surface-container px-4 py-4 text-left"
                disabled={
                  pendingId !== null || account.provisioningStatus !== "ready"
                }
                onClick={() => {
                  select(account.id).catch(() => {
                    setError(
                      "Could not switch accounts. Refresh the list and try again."
                    );
                    setPendingId(null);
                  });
                }}
                variant="ghost"
              >
                <span className="min-w-0 space-y-1">
                  <span className="block break-words font-medium text-foreground">
                    {account.name}
                  </span>
                  {account.countryCode ? (
                    <span className="block font-normal text-muted-foreground text-sm">
                      {account.countryCode}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 pl-3 text-primary text-sm">
                  {accountActionLabel(
                    account.id,
                    session?.accountId,
                    pendingId,
                    account.provisioningStatus === "ready"
                  )}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {isLoaded &&
      !listError &&
      accounts.some((account) => account.provisioningStatus !== "ready") ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm" role="status">
            Your account is still being set up. Refresh the list to check again.
          </p>
          <Button
            onClick={async () => {
              await refetch();
            }}
            variant="secondary"
          >
            Refresh accounts
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="space-y-3">
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
          <Button
            onClick={() => {
              setError(null);
              refetch();
            }}
            variant="secondary"
          >
            Refresh accounts
          </Button>
        </div>
      ) : null}
    </AuthFormFrame>
  );
}
