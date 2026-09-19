# Release dependency audit

Recorded 2026-09-19 against the go-live candidate using Bun 1.4.0.

`bun audit` still exits 1. The targeted overrides in the candidate remove the
reported `fast-uri`, `js-yaml`, `nanoid` and `adm-zip` advisories. The remaining
high-severity dependency paths are:

| Package | Dependency path | Release reachability |
| --- | --- | --- |
| `deepmerge-ts@7.1.5` | `@prisma/config@7.10.0` | Build and migration tooling only. It merges repository-controlled Prisma configuration; no customer or request data reaches this merge. |
| `mysql2@3.15.3` | `prisma@7.10.0` | Prisma CLI optional database support. This repository configures PostgreSQL through Neon and does not create a MySQL connection. |
| `extract-zip@2.0.1` | `@puppeteer/browsers@2.7.1` -> `puppeteer@24.3.1` -> Mint scraping/prebuild | Documentation development tooling only. The release docs commands do not install a browser or extract an operator-supplied archive. Treat a future Mint browser-install or arbitrary scrape workflow as blocked until this path is fixed upstream. |
| `sharp@0.33.5` | Mint prebuild/favicons | Documentation development tooling processes repository-owned assets. App/web and Next runtime resolve fixed `sharp@0.35.4`; no uploaded image reaches the Mint copy. |

The remaining moderate/low groups are `hono`, `qs` and `esbuild`. The original
machine-readable result is retained outside the repository at
`/tmp/teamcalendar-release-scanner/dependency-audit.json`. Rerun the audit after
the final lockfile change and retain the non-zero result with this reachability
record; do not describe the audit as passing.
