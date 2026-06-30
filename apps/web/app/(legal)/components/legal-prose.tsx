import type { ReactNode } from "react";

interface LegalDocumentProps {
  readonly children: ReactNode;
  readonly intro: ReactNode;
  readonly lastUpdated: string;
  readonly title: string;
}

export const LegalDocument = ({
  title,
  lastUpdated,
  intro,
  children,
}: LegalDocumentProps) => (
  <article className="marketing-legal__document">
    <header className="marketing-legal__header">
      <h1>{title}</h1>
      <p className="marketing-legal__updated">Last updated {lastUpdated}</p>
      <p className="marketing-legal__intro">{intro}</p>
    </header>
    {children}
  </article>
);

interface LegalSectionProps {
  readonly children: ReactNode;
  readonly heading: string;
}

export const LegalSection = ({ heading, children }: LegalSectionProps) => (
  <section className="marketing-legal__section">
    <h2>{heading}</h2>
    {children}
  </section>
);

export const LegalParagraph = ({
  children,
}: {
  readonly children: ReactNode;
}) => <p>{children}</p>;

export const LegalList = ({ children }: { readonly children: ReactNode }) => (
  <ul>{children}</ul>
);
