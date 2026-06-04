import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { changelog } from "@/src/data/changelog";

export const metadata: Metadata = createMetadata({
  title: "Changelog",
  description:
    "LeaveSync product updates. A log of new features, improvements, and fixes.",
});

const typeLabels: Record<string, { label: string; colour: string }> = {
  feat: { label: "New", colour: "bg-primary/10 text-primary" },
  improvement: {
    label: "Improved",
    colour: "bg-secondary text-secondary-foreground",
  },
  fix: { label: "Fixed", colour: "bg-muted text-muted-foreground" },
  chore: { label: "Chore", colour: "bg-muted text-muted-foreground" },
};

const ChangelogPage = () => (
  <div className="w-full">
    {/* Page header */}
    <div className="w-full bg-muted/50 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-4 lg:max-w-2xl">
          <p className="font-medium text-primary text-sm uppercase tracking-widest">
            Changelog
          </p>
          <h1 className="font-semibold text-4xl tracking-tight md:text-6xl">
            What&apos;s new
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A running log of LeaveSync product updates, new features,
            improvements, and fixes.
          </p>
        </div>
      </div>
    </div>

    {/* Entries */}
    <div className="w-full py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-0">
          {changelog.map((entry, index) => (
            <div
              className={`flex flex-col gap-8 py-12 lg:flex-row lg:gap-16 ${
                index < changelog.length - 1 ? "border-border border-b" : ""
              }`}
              key={entry.version}
            >
              {/* Date + version sidebar */}
              <div className="flex shrink-0 flex-col gap-1 lg:w-48">
                <time
                  className="font-medium text-muted-foreground text-sm"
                  dateTime={entry.date}
                >
                  {new Date(entry.date).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
                <span className="font-mono text-muted-foreground text-xs">
                  v{entry.version}
                </span>
              </div>

              {/* Content */}
              <div className="flex flex-col gap-5">
                <h2 className="font-semibold text-2xl tracking-tight">
                  {entry.title}
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed">
                  {entry.description}
                </p>
                <ul className="flex flex-col gap-3">
                  {entry.changes.map((change) => {
                    const tag = typeLabels[change.type];
                    return (
                      <li className="flex items-start gap-3" key={change.text}>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-medium text-xs ${tag.colour}`}
                        >
                          {tag.label}
                        </span>
                        <span className="text-sm leading-relaxed">
                          {change.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default ChangelogPage;
