"use client";

import { type ReactNode, useCallback, useRef } from "react";

export const CursorDepthGrid = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    el.style.setProperty("--cx", ((e.clientX - r.left) / r.width).toFixed(3));
    el.style.setProperty("--cy", ((e.clientY - r.top) / r.height).toFixed(3));
  }, []);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.setProperty("--cx", "0.5");
    el.style.setProperty("--cy", "0.5");
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse tracking for visual depth effect only
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: mouse tracking for visual depth effect only
    <div
      className="marketing-hero__grid"
      onMouseLeave={onLeave}
      onMouseMove={onMove}
      ref={ref}
    >
      {children}
    </div>
  );
};
