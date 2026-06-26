"use client";

import { captureException } from "@sentry/nextjs";
import type NextError from "next/error";
import { useEffect } from "react";

interface GlobalErrorProperties {
  readonly error: NextError & { digest?: string };
  readonly reset: () => void;
}

const GlobalError = ({ error, reset }: GlobalErrorProperties) => {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <button onClick={() => reset()} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
};

export default GlobalError;
