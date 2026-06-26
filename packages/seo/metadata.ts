import merge from "lodash.merge";
import type { Metadata } from "next";
import { brandNameDisplay, primaryDomainUrl } from "./branding";
import { resolveCanonicalWebUrl } from "./canonical-url";

type MetadataGenerator = Omit<Metadata, "description" | "title"> & {
  title: string;
  description: string;
  image?: string;
};

const applicationName = brandNameDisplay;
const author: Metadata["authors"] = {
  name: brandNameDisplay,
  url: primaryDomainUrl,
};
const publisher = brandNameDisplay;

export const createMetadata = ({
  title,
  description,
  image,
  ...properties
}: MetadataGenerator): Metadata => {
  const parsedTitle = `${title} | ${applicationName}`;
  const defaultMetadata: Metadata = {
    title: parsedTitle,
    description,
    applicationName,
    metadataBase: resolveCanonicalWebUrl(),
    authors: [author],
    creator: author.name,
    formatDetection: {
      telephone: false,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: parsedTitle,
    },
    openGraph: {
      title: parsedTitle,
      description,
      type: "website",
      siteName: applicationName,
      locale: "en_US",
    },
    publisher,
    twitter: {
      card: "summary_large_image",
    },
  };

  const metadata: Metadata = merge(defaultMetadata, properties);

  if (image && metadata.openGraph) {
    metadata.openGraph.images = [
      {
        url: image,
        width: 1200,
        height: 630,
        alt: title,
      },
    ];
  }

  return metadata;
};
