// Builds a sync-only "dist" for @repo/design-system, which ships as raw source
// (no build, no .d.ts). Output goes to packages/design-system/dist/ (gitignored):
//   entry.ts          - re-exports every components/ui/* file, TeamTimeline and ThemeProvider
//   types/            - declaration emit for the same files (tsc)
//   package.json      - names the package and points `types` at types/index.d.ts
//   styles.css        - compiled Tailwind v4 (globals.css + brand @font-face + root font setup)
//   fonts/            - the package's own woff2 files
// DesignSystemProvider (index.tsx) is deliberately excluded: it wraps Clerk's AuthProvider.
// Run from the repo root: `bun .design-sync/build-dist.mjs`.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = join(root, "packages/design-system");
const dist = join(pkg, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const uiFiles = readdirSync(join(pkg, "components/ui"))
  .filter((f) => f.endsWith(".tsx") && !/\.(test|spec)\./.test(f))
  .map((f) => `components/ui/${f.replace(/\.tsx$/, "")}`)
  .sort();
const modules = [...uiFiles, "components/team-timeline/team-timeline"];

// Runtime entry (bundled by the converter's esbuild pass).
writeFileSync(
  join(dist, "entry.ts"),
  `${modules.map((m) => `export * from "../${m}";`).join("\n")}\nexport { ThemeProvider } from "../providers/theme";\n`
);

// Extra runtime exports (cfg.extraEntries): recharts primitives for ChartContainer
// and lucide-react icons. Both packages export AreaChart/BarChart/PieChart/...,
// and ESM drops names that two `export *` sources share, so recharts is
// star-exported and lucide icons are named explicitly minus recharts' names.
{
  const req = createRequire(join(pkg, "package.json"));
  const recharts = await import(req.resolve("recharts"));
  const lucide = await import(req.resolve("lucide-react"));
  const taken = new Set(Object.keys(recharts));
  const icons = Object.keys(lucide).filter((k) => /^[A-Z]/.test(k) && !taken.has(k));
  writeFileSync(
    join(dist, "extras.ts"),
    `export * from "recharts";\nexport {\n${icons.map((k) => `  ${k},`).join("\n")}\n} from "lucide-react";\n`
  );
}

// Bundle-time path map (cfg.tsconfig). lib/utils.ts imports parseError from
// @repo/observability, which pulls @sentry/nextjs and @logtail/next into a
// browser bundle. Designs never report errors, so that one import resolves to a
// local stub with the same message logic. First matching key wins in the
// converter's paths plugin, so the exact key precedes the wildcards.
mkdirSync(join(dist, "stubs"), { recursive: true });
writeFileSync(
  join(dist, "stubs/observability-error.ts"),
  `export const parseError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
};
`
);
writeFileSync(
  join(dist, "tsconfig.bundle.json"),
  JSON.stringify(
    {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@repo/observability/error": ["./stubs/observability-error.ts"],
          "@repo/design-system/*": ["../*"],
          "@repo/*": ["../../*"],
        },
      },
    },
    null,
    2
  )
);

// Declaration emit (after the stub above exists).
writeFileSync(
  join(dist, "tsconfig.decl.json"),
  JSON.stringify(
    {
      extends: "../tsconfig.json",
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        rootDir: "..",
        outDir: "./types",
        plugins: [],
        // Same observability stub as the bundle, so tsc never walks into
        // packages/observability (and never emits stray .d.ts files there).
        paths: {
          "@repo/observability/error": ["./stubs/observability-error.ts"],
          "@repo/design-system/*": ["../*"],
          "@repo/*": ["../../*"],
        },
      },
      include: [...modules.map((m) => `../${m}.tsx`), "../providers/theme.tsx"],
      exclude: ["../**/*.test.tsx", "../node_modules"],
    },
    null,
    2
  )
);
try {
  execFileSync(join(pkg, "node_modules/.bin/tsc"), ["-p", join(dist, "tsconfig.decl.json")], {
    stdio: "inherit",
  });
} catch {
  // Type errors still emit declarations; only fail if nothing was written.
  console.error("tsc reported errors; continuing with emitted declarations");
}
// shadcn exports every subpart flat (CardHeader, DialogContent, ...), and the
// converter only groups namespace-style compounds, so a full type index yields
// ~280 cards. The type index (which drives card discovery) therefore exports one
// root per file - its first export - while entry.ts keeps every subpart
// importable at runtime. Subparts are documented on the root's prompt via the
// generated docs below.
const exportsOf = (file) => {
  const block = readFileSync(file, "utf8").match(/^export \{([^}]*)\}/m);
  if (block) {
    return block[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("type "));
  }
  return [...readFileSync(file, "utf8").matchAll(/^export function ([A-Z]\w*)/gm)].map((m) => m[1]);
};
const roots = modules.map((m) => {
  const names = exportsOf(join(pkg, `${m}.tsx`)).filter((n) => /^[A-Z]/.test(n));
  return { module: m, root: names[0], parts: names.slice(1) };
});
writeFileSync(
  join(dist, "types/index.d.ts"),
  `${roots.map((r) => `export { ${r.root} } from "./${r.module}";`).join("\n")}\nexport { ThemeProvider } from "./providers/theme";\n`
);

// Per-root docs (cfg.docsDir): group, one-line purpose, subpart signatures and
// the authored preview as the usage example. A matched doc replaces the
// converter's synthesized prompt, so examples are carried here explicitly.
const meta = {
  Accordion: ["Layout", "Vertically stacked, expandable sections."],
  AlertDialog: ["Overlays", "Modal confirmation that interrupts the user and expects a response."],
  Alert: ["Feedback", "Inline callout for status, warning or error messages."],
  AspectRatio: ["Layout", "Constrains content to a fixed width-to-height ratio."],
  Avatar: ["Data display", "Person image with an initials fallback."],
  Badge: ["Data display", "Small status or count label."],
  Breadcrumb: ["Navigation", "Hierarchical location trail."],
  ButtonGroup: ["Actions", "Joins related buttons into one control."],
  Button: ["Actions", "Primary interactive control. Variants: default, secondary, outline, ghost, destructive, link."],
  Calendar: ["Forms", "Month grid date picker (react-day-picker)."],
  Card: ["Layout", "Primary content container with header, content and footer slots."],
  Carousel: ["Layout", "Horizontally scrolling slides (Embla)."],
  ChartContainer: ["Data display", "Recharts wrapper that maps series to theme chart colours."],
  Checkbox: ["Forms", "Binary selection control."],
  Collapsible: ["Layout", "Shows and hides a single region."],
  Command: ["Forms", "Searchable command list and palette (cmdk)."],
  ContextMenu: ["Overlays", "Right-click menu."],
  Dialog: ["Overlays", "Modal window for focused tasks."],
  Drawer: ["Overlays", "Bottom sheet for mobile-first flows (vaul)."],
  DropdownMenu: ["Overlays", "Menu of actions opened from a trigger."],
  Empty: ["Feedback", "Empty-state block with media, title, description and actions."],
  Field: ["Forms", "Form field layout: label, control, description and error."],
  Form: ["Forms", "react-hook-form bindings for fields, labels and messages."],
  HoverCard: ["Overlays", "Preview card shown on hover."],
  InputGroup: ["Forms", "Input with inline addons, text or buttons."],
  InputOTP: ["Forms", "One-time-code input split into slots."],
  Input: ["Forms", "Single-line text input."],
  Item: ["Data display", "List row with media, content and actions."],
  Kbd: ["Data display", "Keyboard key hint."],
  Label: ["Forms", "Accessible label for a form control."],
  Menubar: ["Navigation", "Desktop-style horizontal menu bar."],
  NavigationMenu: ["Navigation", "Site navigation with dropdown panels."],
  Pagination: ["Navigation", "Page navigation controls."],
  Popover: ["Overlays", "Floating panel anchored to a trigger."],
  Progress: ["Feedback", "Determinate progress bar."],
  RadioGroup: ["Forms", "Single choice from a set of options."],
  ResizablePanelGroup: ["Layout", "Panels separated by draggable handles."],
  ScrollArea: ["Layout", "Scroll container with styled scrollbars."],
  Select: ["Forms", "Dropdown single-select."],
  Separator: ["Layout", "Visual divider between content."],
  Sheet: ["Overlays", "Panel that slides in from a screen edge."],
  Sidebar: ["Navigation", "Application sidebar. Must be wrapped in SidebarProvider."],
  Skeleton: ["Feedback", "Loading placeholder block."],
  Slider: ["Forms", "Range input for one or more values."],
  Toaster: ["Feedback", "Toast host for sonner notifications. Mounted once at the app root."],
  Spinner: ["Feedback", "Indeterminate loading indicator."],
  Switch: ["Forms", "On/off toggle for settings."],
  Table: ["Data display", "Tabular data."],
  Tabs: ["Navigation", "Switches between views in the same context."],
  Textarea: ["Forms", "Multi-line text input."],
  ToggleGroup: ["Actions", "Set of toggles with single or multiple selection."],
  Toggle: ["Actions", "Two-state button."],
  Tooltip: ["Overlays", "Short label shown on hover or focus."],
  TeamTimeline: ["Team Calendar", "Team availability timeline: one row per person, blocks per leave or availability record."],
};
const docsDir = join(dist, "docs");
mkdirSync(docsDir, { recursive: true });
const declOf = (dtsText, name) => {
  const m = dtsText.match(new RegExp(`declare (?:function|const) ${name}\\b[^;]*;`, "s"));
  return m ? m[0].replace(/^declare /, "").replace(/\s+/g, " ") : null;
};
for (const { module, root, parts } of roots) {
  const [group, purpose] = meta[root] ?? ["General", ""];
  const dtsText = readFileSync(join(dist, `types/${module}.d.ts`), "utf8");
  const lines = ["---", `category: ${group}`, "---", "", purpose, ""];
  if (parts.length) {
    lines.push(
      "## Parts",
      "",
      `Compose \`${root}\` from these exports (all on \`window.TeamCalendar\`):`,
      "",
      "```ts",
      ...parts.map((p) => declOf(dtsText, p) ?? `${p}: React.ComponentType<any>;`),
      "```",
      ""
    );
  }
  const preview = join(import.meta.dirname, "previews", `${root}.tsx`);
  if (existsSync(preview)) {
    const body = readFileSync(preview, "utf8")
      .split("\n")
      .filter((l) => !/^import\b/.test(l))
      .join("\n")
      .trim();
    lines.push("## Examples", "", "```tsx", body, "```", "");
  }
  writeFileSync(join(docsDir, `${root}.md`), lines.join("\n"));
}

writeFileSync(
  join(dist, "package.json"),
  JSON.stringify(
    { name: "@repo/design-system", version: "0.0.0", private: true, types: "types/index.d.ts", module: "entry.ts" },
    null,
    2
  )
);

writeFileSync(
  join(docsDir, "ThemeProvider.md"),
  `---
category: Theme
---

next-themes provider used at the product root. Defaults: \`attribute="class"\`, \`defaultTheme="system"\`, \`enableSystem\`, \`disableTransitionOnChange\`. Dark mode applies when an ancestor has the \`dark\` class (or \`data-theme="dark"\`); every colour token switches automatically. Pass \`forcedTheme="dark"\` or \`defaultTheme="dark"\` to render a design in dark mode.

## Examples

\`\`\`tsx
<ThemeProvider defaultTheme="light">
  <App />
</ThemeProvider>
\`\`\`
`
);

// Stylesheet. The product sets these on <html> via next/font (lib/fonts.ts):
// the font variables plus `font-sans antialiased`. Designs have no next/font, so
// the same setup ships as plain CSS. @source covers the product apps so the
// compiled utilities match the vocabulary the real screens use.
cpSync(join(pkg, "fonts"), join(dist, "fonts"), { recursive: true });
const tokenColours = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "primary-container", "on-primary-container",
  "secondary", "secondary-foreground", "tertiary", "editorial-accent", "on-editorial-accent",
  "muted", "muted-foreground", "accent", "accent-foreground", "accent-container", "on-accent-container",
  "surface-variant", "inverse-surface", "inverse-on-surface", "outline", "outline-variant",
  "destructive", "destructive-foreground", "error-container", "on-error-container", "success",
  "warning", "warning-foreground", "warning-container", "on-warning-container",
  "surface-container-lowest", "surface-container-low", "surface-container", "surface-container-high",
  "surface-container-highest", "on-surface", "on-surface-variant", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
];
const typeScale = [
  "display-lg", "display-md", "display-sm", "headline-lg", "headline-md", "title-lg", "title-md",
  "title-sm", "body-lg", "body-md", "body-sm", "label-lg", "label-md", "label-sm",
];
// Designs get no runtime Tailwind, so the core layout vocabulary is compiled up
// front: Tailwind's default spacing scale for spacing/sizing utilities, plus
// common flex/grid/position/text utilities with responsive prefixes.
const scale = "0,0.5,1,1.5,2,2.5,3,3.5,4,5,6,7,8,9,10,11,12,14,16,20,24,28,32,36,40,44,48,52,56,60,64,72,80,96";
const layoutSafelist = [
  `{sm:,md:,lg:,}{p,px,py,pt,pr,pb,pl,m,mx,my,mt,mr,mb,ml,gap,gap-x,gap-y,space-x,space-y}-{${scale}}`,
  `{-m,-mx,-my,-mt,-mb,-ml,-mr,-space-x,-space-y}-{0.5,1,1.5,2,3,4}`,
  `{sm:,md:,lg:,}{w,h,size,min-w,min-h,max-h}-{${scale},full,auto,fit,screen,px}`,
  `{sm:,md:,lg:,}max-w-{xs,sm,md,lg,xl,2xl,3xl,4xl,5xl,6xl,7xl,full,prose,none}`,
  `{sm:,md:,lg:,}w-{1/2,1/3,2/3,1/4,3/4}`,
  `{sm:,md:,lg:,}grid-cols-{1..12} {sm:,md:,lg:,}col-span-{1..12} col-span-full grid-rows-{1..6}`,
  `{sm:,md:,lg:,}{flex,grid,block,inline-flex,inline-block,hidden,contents} {sm:,md:,lg:,}flex-{row,col,wrap,1,none,auto} flex-row-reverse flex-col-reverse grow shrink-0 basis-0`,
  `{sm:,md:,lg:,}items-{start,center,end,baseline,stretch} {sm:,md:,lg:,}justify-{start,center,end,between,around,evenly} self-{start,center,end,stretch} place-items-center`,
  `{relative,absolute,fixed,sticky,inset-0,inset-x-0,inset-y-0,top-0,right-0,bottom-0,left-0,z-10,z-20,z-50,overflow-hidden,overflow-auto,overflow-x-auto,overflow-y-auto,truncate,line-clamp-1,line-clamp-2,line-clamp-3,whitespace-nowrap,text-left,text-center,text-right,uppercase,tabular-nums,underline,italic}`,
  `text-{xs,sm,base,lg,xl,2xl,3xl,4xl} font-{normal,medium,semibold,bold} leading-{none,tight,snug,normal,relaxed}`,
  `{border,border-t,border-b,border-l,border-r,border-0,border-2,border-dashed,divide-y,divide-x,shadow-none,opacity-50,opacity-60,opacity-70,opacity-80,cursor-pointer,select-none,sr-only}`,
];
const srcCss = `@import "../styles/globals.css";
${layoutSafelist.map((s) => `@source inline("${s}");`).join("\n")}
@source "../../../apps/app";
@source "../../../.design-sync/previews";
@source inline("{hover:,}{bg,text,border,ring,fill,stroke,outline}-{${tokenColours.join(",")}}");
@source inline("text-{${typeScale.join(",")}}");
@source inline("{rounded,rounded-t,rounded-b}-{sm,md,lg,xl,2xl,3xl,full}");
@source inline("elevation-{popover,modal,tooltip} shadow-[var(--elev-card)] tracking-{display,body,label,label-wide} font-{regular,medium,semibold,bold,sans,serif,accent}");

@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("./fonts/plus-jakarta-sans.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Lora";
  src: url("./fonts/lora-regular.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Lora";
  src: url("./fonts/lora-italic.woff2") format("woff2");
  font-weight: 400 700;
  font-style: italic;
  font-display: swap;
}

:root {
  --font-plus-jakarta-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-lora: "Lora", ui-serif, Georgia, serif;
}

@layer base {
  html {
    @apply touch-manipulation font-sans antialiased;
  }
}
`;
writeFileSync(join(dist, "styles.src.css"), srcCss);

const req = createRequire(join(pkg, "package.json"));
const postcss = req("postcss");
const tailwind = req("@tailwindcss/postcss");
const from = join(dist, "styles.src.css");
const result = await postcss([tailwind({ base: pkg, optimize: false })]).process(srcCss, {
  from,
  to: join(dist, "styles.css"),
});
writeFileSync(join(dist, "styles.css"), result.css);
console.error(`build-dist: ${modules.length} modules, styles.css ${(result.css.length / 1024).toFixed(0)} KiB`);
