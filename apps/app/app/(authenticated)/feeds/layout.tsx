import type { ReactNode } from "react";
import { FeedTokenSessionProvider } from "./feed-token-session";

interface FeedLayoutProperties {
  readonly children: ReactNode;
  readonly modal: ReactNode;
}

const FeedLayout = ({ children, modal }: FeedLayoutProperties) => (
  <FeedTokenSessionProvider origin={subscribeOrigin()}>
    {children}
    {modal}
  </FeedTokenSessionProvider>
);

export default FeedLayout;

function subscribeOrigin(): string {
  // Feed subscribe URLs must point at the API origin that serves
  // /ical/:token.ics. There is no safe hardcoded default, so require the
  // origin to be configured rather than falling back to a wrong host.
  const origin =
    process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be configured to build feed subscribe URLs."
    );
  }
  return origin;
}
