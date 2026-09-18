import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { BlogPostSummary } from "@/src/lib/blog";
import styles from "../blog.module.css";

interface ArticleFooterProperties {
  readonly post: BlogPostSummary;
  readonly related: readonly BlogPostSummary[];
}

const nextStepByCategory = {
  guide: {
    href: "/integrations",
    label: "Review the Xero Payroll connection",
  },
  update: {
    href: "/changelog",
    label: "See what has shipped since this update",
  },
} as const;

export const ArticleFooter = ({ post, related }: ArticleFooterProperties) => {
  const nextStep = nextStepByCategory[post.category];

  return (
    <footer className={styles.articleFooter}>
      <div className={styles.authorBlock}>
        <span aria-hidden="true" className={styles.authorMark}>
          TC
        </span>
        <div>
          <p>Written by {post.author}</p>
          <span>{post.authorRole}</span>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className={styles.related}>
          <h2 id="related-heading">Keep reading</h2>
          <div>
            {related.map((relatedPost) => (
              <Link
                className="marketing-content-link"
                href={`/blog/${relatedPost.slug}`}
                key={relatedPost.slug}
              >
                <span>{relatedPost.category}</span>
                {relatedPost.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.articleNextStep}>
        <p>Useful next step</p>
        <Link className="marketing-content-link" href={nextStep.href}>
          {nextStep.label} <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </div>
    </footer>
  );
};
