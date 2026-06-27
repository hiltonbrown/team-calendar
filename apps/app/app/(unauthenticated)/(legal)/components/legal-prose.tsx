import type { ReactNode } from "react";

interface LegalDocumentProps {
  readonly children: ReactNode;
  readonly intro: ReactNode;
  readonly lastUpdated: string;
  readonly title: string;
}

// Shared scaffold for policy documents: a title, a last-updated line, a lead
// paragraph, then a stack of sections. Keeps the two legal pages visually
// identical without repeating the typographic class strings on each one.
export const LegalDocument = ({
  title,
  lastUpdated,
  intro,
  children,
}: LegalDocumentProps) => (
  <article className="flex flex-col gap-10">
    <header className="flex flex-col gap-3">
      <h1 className="font-semibold text-display-sm text-foreground tracking-tight">
        {title}
      </h1>
      <p className="text-body-sm text-muted-foreground">
        Last updated {lastUpdated}
      </p>
      <p className="text-balance text-body-lg text-muted-foreground">{intro}</p>
    </header>
    {children}
  </article>
);

interface LegalSectionProps {
  readonly children: ReactNode;
  readonly heading: string;
}

export const LegalSection = ({ heading, children }: LegalSectionProps) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-semibold text-foreground text-title-lg tracking-tight">
      {heading}
    </h2>
    {children}
  </section>
);

export const LegalParagraph = ({
  children,
}: {
  readonly children: ReactNode;
}) => (
  <p className="text-body-md text-muted-foreground leading-relaxed">
    {children}
  </p>
);

export const LegalList = ({ children }: { readonly children: ReactNode }) => (
  <ul className="flex list-disc flex-col gap-2 pl-5 text-body-md text-muted-foreground leading-relaxed">
    {children}
  </ul>
);
