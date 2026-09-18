export type FeedPrivacyMode = "masked" | "named" | "private";

export const feedPrivacyOptions = [
  {
    description: "Subscribers see names and allowed availability details",
    label: "Named",
    value: "named",
  },
  {
    description: "Subscribers see Out of office",
    label: "Masked",
    value: "masked",
  },
  {
    description: "Subscribers see Busy only",
    label: "Private",
    value: "private",
  },
] as const satisfies ReadonlyArray<{
  description: string;
  label: string;
  value: FeedPrivacyMode;
}>;

export function feedPrivacyDescription(value: FeedPrivacyMode): string {
  if (value === "named") {
    return feedPrivacyOptions[0].description;
  }
  if (value === "masked") {
    return feedPrivacyOptions[1].description;
  }
  return feedPrivacyOptions[2].description;
}

export function feedPrivacyLabel(value: FeedPrivacyMode): string {
  if (value === "named") {
    return feedPrivacyOptions[0].label;
  }
  if (value === "masked") {
    return feedPrivacyOptions[1].label;
  }
  return feedPrivacyOptions[2].label;
}
