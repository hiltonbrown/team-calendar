"use client";

import { captureException } from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import styles from "./blog.module.css";

interface BlogErrorProperties {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export const BlogErrorContent = ({
  reset,
}: Pick<BlogErrorProperties, "reset">) => (
  <main className={`fmkt-page ${styles.page}`} id="blog-main" tabIndex={-1}>
    <section className={styles.errorState}>
      <p className={styles.eyebrow}>Reading interrupted</p>
      <h1>This guide could not be opened.</h1>
      <p>
        Try loading it again. If the problem continues, the Blog index is still
        available.
      </p>
      <div className={styles.errorActions}>
        <button
          className="marketing-btn marketing-btn--primary"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link className="marketing-content-link" href="/blog">
          Back to Blog
        </Link>
      </div>
    </section>
  </main>
);

const BlogError = ({ error, reset }: BlogErrorProperties) => {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return <BlogErrorContent reset={reset} />;
};

export default BlogError;
