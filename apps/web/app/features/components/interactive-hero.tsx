import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";

export const InteractiveHeroSection = () => (
  <section className="ft-hero">
    <h1 className="ft-hero__title">
      See everyone’s <em>availability.</em>
    </h1>
    <p className="ft-hero__body">
      See leave, working from home and travel in one calendar. Include
      employees, directors, contractors and offshore staff, whether they’re on
      payroll or not.
    </p>
    <Link className="marketing-btn marketing-btn--primary" href={signUpHref}>
      Sign up
    </Link>
  </section>
);
