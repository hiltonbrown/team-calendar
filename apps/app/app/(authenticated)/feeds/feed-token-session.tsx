"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

interface TokenSessionValue {
  clearToken: (feedId: string) => void;
  origin: string;
  setToken: (feedId: string, plaintext: string) => void;
  tokenForFeed: (feedId: string) => string | null;
}

const TokenSessionContext = createContext<TokenSessionValue | null>(null);
const TRAILING_SLASH_PATTERN = /\/$/;

export function FeedTokenSessionProvider({
  children,
  origin,
}: {
  children: ReactNode;
  origin: string;
}) {
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const value = useMemo<TokenSessionValue>(
    () => ({
      clearToken: (feedId) =>
        setTokens((current) => {
          const next = { ...current };
          delete next[feedId];
          return next;
        }),
      origin,
      setToken: (feedId, plaintext) =>
        setTokens((current) => ({ ...current, [feedId]: plaintext })),
      tokenForFeed: (feedId) => tokens[feedId] ?? null,
    }),
    [origin, tokens]
  );
  return (
    <TokenSessionContext.Provider value={value}>
      {children}
    </TokenSessionContext.Provider>
  );
}

export function useFeedTokenSession(): TokenSessionValue {
  const value = useContext(TokenSessionContext);
  if (!value) {
    throw new Error("FeedTokenSessionProvider is missing");
  }
  return value;
}

export function buildSubscribeUrl(origin: string, plaintext: string): string {
  return `${origin.replace(TRAILING_SLASH_PATTERN, "")}/ical/${plaintext}.ics`;
}
