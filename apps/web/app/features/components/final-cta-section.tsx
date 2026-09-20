import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";

export const FinalCtaSection = () => (
  <section className="fmkt-cta">
    <div className="fmkt-container">
      <div className="fmkt-cta__panel">
        <div className="fmkt-cta__content">
          <h2 className="fmkt-cta__heading">
            Bring your team’s availability together.
          </h2>
          <div className="fmkt-cta__actions">
            <Link
              className="marketing-btn marketing-btn--primary"
              href={signUpHref}
            >
              Sign up
            </Link>
            <Link
              className="marketing-btn marketing-btn--outline"
              href="/contact"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);
