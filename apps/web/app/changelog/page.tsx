import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { changelog } from "@/src/data/changelog";

export const metadata: Metadata = createMetadata({
  title: "Changelog",
  description:
    "Team Calendar product updates. A log of new features, improvements, and fixes.",
});

const typeLabels: Record<string, { label: string }> = {
  feat: { label: "New" },
  improvement: { label: "Improved" },
  fix: { label: "Fixed" },
  chore: { label: "Chore" },
};

const ChangelogPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Changelog</p>
          <h1 className="marketing-simple__title">What&apos;s new</h1>
          <p className="marketing-simple__lead">
            A running log of Team Calendar product updates, new features,
            improvements, and fixes.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__timeline">
          {changelog.map((entry) => (
            <div className="marketing-simple__entry" key={entry.version}>
              <div>
                <time
                  className="marketing-simple__entry-date"
                  dateTime={entry.date}
                >
                  {new Date(entry.date).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                <p className="marketing-simple__version">v{entry.version}</p>
              </div>

              <div className="marketing-simple__panel">
                <h2>{entry.title}</h2>
                <p>{entry.description}</p>
                <ul className="marketing-simple__list">
                  {entry.changes.map((change) => {
                    const tag = typeLabels[change.type];
                    return (
                      <li key={change.text}>
                        <span className="marketing-simple__tag">
                          {tag?.label ?? "Update"}
                        </span>
                        <span>{change.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  </div>
);

export default ChangelogPage;
