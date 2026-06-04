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
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://leavesync.app"
  );
}
