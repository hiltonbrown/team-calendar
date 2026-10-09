export type CountryCode = "AU" | "NZ" | "UK";

export interface RegionDefinition {
  readonly code: string;
  readonly label: string;
}

export const COUNTRIES: ReadonlyArray<{
  readonly code: CountryCode;
  readonly label: string;
}> = [
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "UK", label: "United Kingdom" },
];

export const REGIONS: Record<CountryCode, readonly RegionDefinition[]> = {
  AU: [
    { code: "ACT", label: "Australian Capital Territory" },
    { code: "NSW", label: "New South Wales" },
    { code: "NT", label: "Northern Territory" },
    { code: "QLD", label: "Queensland" },
    { code: "SA", label: "South Australia" },
    { code: "TAS", label: "Tasmania" },
    { code: "VIC", label: "Victoria" },
    { code: "WA", label: "Western Australia" },
  ],
  NZ: [
    { code: "AUK", label: "Auckland" },
    { code: "BOP", label: "Bay of Plenty" },
    { code: "CAN", label: "Canterbury" },
    { code: "CIT", label: "Chatham Islands" },
    { code: "GIS", label: "Gisborne" },
    { code: "HKB", label: "Hawke's Bay" },
    { code: "MBH", label: "Marlborough" },
    { code: "MWT", label: "Manawatū-Whanganui" },
    { code: "NSN", label: "Nelson" },
    { code: "NTL", label: "Northland" },
    { code: "OTA", label: "Otago" },
    { code: "STL", label: "Southland" },
    { code: "TAS", label: "Tasman" },
    { code: "TKI", label: "Taranaki" },
    { code: "WGN", label: "Wellington" },
    { code: "WKO", label: "Waikato" },
    { code: "WTC", label: "West Coast" },
  ],
  UK: [
    { code: "EAW", label: "England and Wales" },
    { code: "SCT", label: "Scotland" },
    { code: "NIR", label: "Northern Ireland" },
  ],
};

// Common alternative names that map onto a registry region.
const REGION_ALIASES: Record<CountryCode, Record<string, string>> = {
  AU: {},
  NZ: { "manawatu whanganui": "MWT", "manawatu-whanganui": "MWT" },
  UK: { england: "EAW", wales: "EAW" },
};

export function isCountryCode(
  value: string | null | undefined
): value is CountryCode {
  return value === "AU" || value === "NZ" || value === "UK";
}

export function isRegionCode(country: string, code: string): boolean {
  return (
    isCountryCode(country) &&
    REGIONS[country].some((region) => region.code === code)
  );
}

export function regionLabel(country: string, code: string): string | null {
  if (!isCountryCode(country)) {
    return null;
  }
  return REGIONS[country].find((region) => region.code === code)?.label ?? null;
}

export function normaliseRegionCode(
  country: string,
  value: string | null | undefined
): string | null {
  if (!(isCountryCode(country) && value)) {
    return null;
  }
  const needle = value.trim().toLowerCase();
  if (needle === "") {
    return null;
  }
  const match = REGIONS[country].find(
    (region) =>
      region.code.toLowerCase() === needle ||
      region.label.toLowerCase() === needle
  );
  return match?.code ?? REGION_ALIASES[country][needle] ?? null;
}
