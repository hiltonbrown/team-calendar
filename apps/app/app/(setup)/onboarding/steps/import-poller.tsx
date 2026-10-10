"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_INTERVAL_MS = 3000;

// Refreshes server-rendered import progress while a stage is running and
// stops as soon as nothing is running or the step unmounts.
export function ImportPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return null;
}
