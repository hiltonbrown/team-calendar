import type { ReactNode } from "react";

interface SectionIntroProps {
  copy: string;
  eyebrow: string;
  title: ReactNode;
}

export const SectionIntro = ({ copy, eyebrow, title }: SectionIntroProps) => (
  <div className="marketing-section-intro">
    <p className="marketing-overline">{eyebrow}</p>
    <h2>{title}</h2>
    <p>{copy}</p>
  </div>
);
