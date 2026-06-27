import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { brandNameDisplay } from "@repo/seo/branding";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandGlyph } from "../components/brand-glyph";

interface LegalLayoutProps {
  readonly children: ReactNode;
}

// A plain, scrollable reading surface for policy documents. Deliberately
// distinct from the (auth) brand-panel shell: legal copy needs full width,
// vertical scroll, and comfortable measure rather than a centred form pane.
const LegalLayout = ({ children }: LegalLayoutProps) => (
  <div className="min-h-dvh bg-background text-foreground">
    <header className="border-border/60 border-b">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Link
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
          href="/sign-in"
        >
          <BrandGlyph className="size-8" />
          <span className="font-semibold text-foreground text-title-md tracking-tight">
            {brandNameDisplay}
          </span>
        </Link>
        <ModeToggle />
      </div>
    </header>

    <main className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
      {children}
    </main>
  </div>
);

export default LegalLayout;
