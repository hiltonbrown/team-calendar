import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appDirectory = resolve(import.meta.dirname, "..");
const readAppFile = (path: string) =>
  readFileSync(resolve(appDirectory, path), "utf8");

const routeStyleImports = [
  'import "../styles/home.css";',
  'import "../styles/features.css";',
  'import "../styles/motion.css";',
];

describe("Marketing stylesheet ownership", () => {
  it("keeps the root stylesheet limited to global tokens and shell styles", () => {
    const source = readAppFile("styles.css");

    expect(source).toContain(
      '@import "@repo/design-system/styles/globals.css";'
    );
    expect(source).toContain('@import "./styles/tokens.css";');
    expect(source).toContain('@import "./styles/shell.css";');
    expect(source).not.toContain("home.css");
    expect(source).not.toContain("features.css");
    expect(source).not.toContain("motion.css");
  });

  it("loads the home visual system from the home route group in one order", () => {
    const source = readAppFile("(home)/layout.tsx");
    const importIndexes = routeStyleImports.map((styleImport) =>
      source.indexOf(styleImport)
    );

    expect(importIndexes.every((index) => index >= 0)).toBe(true);
    expect(importIndexes).toEqual([...importIndexes].sort((a, b) => a - b));
  });

  it("loads the features visual system from its route in the same order", () => {
    const source = readAppFile("features/page.tsx");
    const importIndexes = routeStyleImports.map((styleImport) =>
      source.indexOf(styleImport)
    );

    expect(importIndexes.every((index) => index >= 0)).toBe(true);
    expect(importIndexes).toEqual([...importIndexes].sort((a, b) => a - b));
  });

  it("loads only feature and motion styles for pricing", () => {
    const source = readAppFile("pricing/page.tsx");
    const featuresIndex = source.indexOf(routeStyleImports[1]);
    const motionIndex = source.indexOf(routeStyleImports[2]);

    expect(source).not.toContain(routeStyleImports[0]);
    expect(featuresIndex).toBeGreaterThan(-1);
    expect(motionIndex).toBeGreaterThan(featuresIndex);
  });

  it("leaves integrations on extracted shared shell primitives", () => {
    const source = readAppFile("integrations/page.tsx");

    for (const styleImport of routeStyleImports) {
      expect(source).not.toContain(styleImport);
    }
  });

  it("keeps About composition in its route-owned CSS Module", () => {
    const aboutSource = readAppFile("about/page.tsx");
    const shellSource = readAppFile("styles/shell.css");

    expect(aboutSource).toContain('import styles from "./about.module.css";');
    expect(shellSource).not.toContain(".about-");
    expect(shellSource).not.toContain(".aboutPage");
  });

  it("keeps Careers composition in its route-owned CSS Module", () => {
    const careersSource = readAppFile("careers/page.tsx");
    const shellSource = readAppFile("styles/shell.css");

    expect(careersSource).toContain(
      'import styles from "./careers.module.css";'
    );
    expect(shellSource).not.toContain(".practiceGrid");
    expect(readAppFile("about/page.tsx")).not.toContain("careers.module.css");
  });

  it("keeps Status composition in its route-owned CSS Module", () => {
    const statusSource = readAppFile("status/page.tsx");
    const statusStyles = readAppFile("status/status.module.css");
    const shellSource = readAppFile("styles/shell.css");

    expect(statusSource).toContain('import styles from "./status.module.css";');
    expect(statusStyles).toContain(".componentList");
    expect(shellSource).not.toContain(".componentList");
    expect(shellSource).not.toContain(".incidentCard");
    for (const styleImport of routeStyleImports) {
      expect(statusSource).not.toContain(styleImport);
    }
  });
});
