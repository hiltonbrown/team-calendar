"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  ClerkProvider,
  PricingTable,
} from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

// The marketing site mounts no global ClerkProvider (auth is disabled in the
// root layout), so we scope one here around the table only. Billing is enforced
// at the Clerk Organisation level (PRODUCT.md), so the table renders org plans.
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const appearance = {
  variables: {
    fontFamily: "var(--marketing-font)",
    colorPrimary: "var(--primary)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--background)",
    colorInputBackground: "var(--input)",
    colorInputText: "var(--foreground)",
    borderRadius: "16px",
  },
};

const skeletonCards = ["a", "b", "c"] as const;

const PlansSkeleton = () => (
  <div aria-hidden="true" className="fmkt-plan-skeleton">
    {skeletonCards.map((card) => (
      <div className="fmkt-plan-skeleton__card" key={card}>
        <span className="fmkt-plan-skeleton__bar fmkt-plan-skeleton__bar--title" />
        <span className="fmkt-plan-skeleton__bar fmkt-plan-skeleton__bar--price" />
        <span className="fmkt-plan-skeleton__bar" />
        <span className="fmkt-plan-skeleton__bar" />
        <span className="fmkt-plan-skeleton__bar fmkt-plan-skeleton__bar--short" />
        <span className="fmkt-plan-skeleton__bar fmkt-plan-skeleton__bar--button" />
      </div>
    ))}
  </div>
);

const PlansFallback = () => (
  <div className="fmkt-plan-fallback">
    <h3>Plans are being finalised.</h3>
    <p>
      We are putting the finishing touches on billing. Tell us about your team
      and we will size the right plan with you.
    </p>
    <a className="marketing-btn marketing-btn--primary" href="#contact">
      Talk to us
    </a>
  </div>
);

// Clerk can load successfully yet render an empty table when no plans are
// configured in Billing. Measure the rendered height after a settle window and
// show the fallback instead of a blank box; the observer keeps the decision
// correct if plans arrive late on a slow connection.
const PlansTable = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    let settled = false;
    const measure = () => {
      if (settled) {
        setIsEmpty(node.getBoundingClientRect().height < 64);
      }
    };
    const settle = window.setTimeout(() => {
      settled = true;
      measure();
    }, 1800);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div className="fmkt-pricing-plans__table" ref={ref}>
        <PricingTable appearance={appearance} for="organization" />
      </div>
      {isEmpty ? <PlansFallback /> : null}
    </>
  );
};

export const PricingPlans = () => {
  // No publishable key means Billing is not wired up on this deployment; render
  // the fallback rather than letting ClerkProvider throw on a missing key.
  if (!publishableKey) {
    return <PlansFallback />;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkLoading>
        <PlansSkeleton />
      </ClerkLoading>
      <ClerkLoaded>
        <PlansTable />
      </ClerkLoaded>
      <ClerkFailed>
        <PlansFallback />
      </ClerkFailed>
    </ClerkProvider>
  );
};
