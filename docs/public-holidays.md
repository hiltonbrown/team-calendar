# Public holiday data

Official public holidays for Australia, New Zealand and the United Kingdom ship with the app as three data files. There is no runtime holiday API. Each organisation sees the holidays for its own country and each location's state or region, and adds its own company or one-off days in the app.

| File | Country |
|---|---|
| `packages/core/src/public-holidays/reference/data/au.json` | Australia |
| `packages/core/src/public-holidays/reference/data/nz.json` | New Zealand |
| `packages/core/src/public-holidays/reference/data/uk.json` | United Kingdom |

The files are validated when the app starts. An invalid entry stops startup with an error naming the file and the entry, so a mistake cannot reach customers silently. There are no CI tests on the data files.

## Annual upkeep

The team updates the files by hand each September, so the data always covers the current year plus the next two.

1. Collect next year's dates from the official sources below. Add the third year as soon as its dates are published.
2. Add one entry per holiday and region to each country's file, in date order.
3. Prune years before the current year (see below).
4. Set `PUBLIC_HOLIDAY_DATA_VERSION` in `packages/core/src/public-holidays/reference/reference-holidays.ts` to the date of the change (`YYYY-MM-DD`). Calendar feeds use it as the publication time for official holidays.
5. Run `bun run dev` (or `bun run build`) and confirm the app starts, then check the Public Holidays page for an affected location.

If a government announces a one-off holiday mid-year, add it the same way and update the data version.

## File format

Each file is a JSON object with the country code and a list of entries:

```json
{
  "country": "AU",
  "entries": [
    {
      "id": "au-qld-2026-10-05-kings-birthday",
      "date": "2026-10-05",
      "name": "King's Birthday",
      "region": "QLD",
      "kind": "public"
    }
  ]
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | Always | `<country>-<region or national>-<date>-<slug>`, lower case, for example `au-qld-2026-10-05-kings-birthday` or `nz-national-2026-02-06-waitangi-day`. The country, region and date must match the entry's own fields. |
| `date` | Always | A real calendar date, `YYYY-MM-DD`. |
| `name` | Always | The holiday name as published by the government. |
| `region` | Always | A region code from `packages/core/src/regions.ts`, or `null` for a national holiday. |
| `kind` | Always | `public` (a full day off), `part_day` (from a start time, shown but treated as a working day) or `local` (off by default; admins switch it on per location). |
| `startsAt` | `part_day` only | Start time, `HH:mm` in 24-hour time, for example `18:00`. Not allowed on other kinds. |
| `area` | `local` only | The town or district it applies to, for example `Brisbane`. Not allowed on other kinds. |

Region codes are AU state abbreviations (`ACT`, `NSW`, `NT`, `QLD`, `SA`, `TAS`, `VIC`, `WA`), NZ ISO 3166-2 region codes (for example `AUK`, `CAN`, `WGN`) and UK nations (`EAW` for England and Wales, `SCT`, `NIR`).

Never change the `id` of an existing entry. Organisation preferences (hidden holidays, working-day overrides and local day switches) and calendar feed UIDs are keyed on it, so a changed id silently drops those settings and republishes the event. Correct a wrong name or date by editing those fields; if a holiday moves to a different date, remove the old entry and add a new one.

## Where to find official dates

- Australia: each state and territory government publishes its own list (for example the Queensland Government and NSW Industrial Relations public holiday pages). Use the state page, not a national summary, because regional variations are common.
- New Zealand: Employment New Zealand, public holidays and anniversary dates. Regional anniversary days are entered as `local` national entries with the province as the `area`.
- United Kingdom: GOV.UK, UK bank holidays, which lists England and Wales, Scotland, and Northern Ireland separately.

## How holidays apply

- A location uses its own state or region. A location without one uses the organisation's region when it is in the same country, otherwise national holidays only.
- People without a location get the organisation's country and region.
- Admins can hide a holiday for the whole organisation, mark it as a working or non-working day for one location, and switch local days on per location (Settings, Holidays). These choices are stored in `public_holiday_preferences`; the official dates themselves are never copied into the database.
- Custom holidays are stored per organisation in `public_holidays` and apply to everyone, one country, or one region.

## Pruning old years

Remove entries for years before the current year during the September update. Preferences for removed holidays become inert and are harmless; they can be left in place. Keeping only the current year plus two keeps the files short and easy to review.
