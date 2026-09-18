import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncPathwayStrip } from "./sync-pathway-strip";

describe("SyncPathwayStrip motion paths", () => {
  it("binds every packet to the exact visible SVG path", () => {
    const html = renderToStaticMarkup(<SyncPathwayStrip />);

    for (const pathId of [
      "sync-path-xero",
      "sync-path-team",
      "sync-path-return",
    ]) {
      expect(html).toContain(`id="${pathId}"`);
      expect(html).toContain(`href="#${pathId}"`);
    }
    expect(html.match(/pathLength="1"/g)).toHaveLength(3);
    expect(html.match(/<animateMotion/g)).toHaveLength(3);
    expect(html.match(/keyPoints="0;0;1;1"/g)).toHaveLength(3);
  });

  it("uses normalised draw lengths without a second CSS motion path", () => {
    const features = readFileSync(
      new URL("../../styles/features.css", import.meta.url),
      "utf8"
    );
    const motion = readFileSync(
      new URL("../../styles/motion.css", import.meta.url),
      "utf8"
    );

    expect(features.match(/stroke-dasharray: 1;/g)).toHaveLength(3);
    expect(features).not.toContain("offset-path:");
    expect(motion).not.toContain("fmkt-packet-travel");
    expect(motion.match(/--fmkt-sync-draw-[123]: 1;/g)).toHaveLength(3);
  });
});
