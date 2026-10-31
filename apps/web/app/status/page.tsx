import { getPublicStatus } from "@repo/observability/status";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import styles from "./status.module.css";
import { StatusContent } from "./status-content";

export const revalidate = 60;

export const metadata: Metadata = createMetadata({
  alternates: { canonical: "/status" },
  description:
    "Current Team Calendar service health, incident updates, maintenance, and support paths.",
  openGraph: { url: "/status" },
  title: "Status",
});

const StatusPage = async () => (
  <StatusContent result={await getPublicStatus()} styles={styles} />
);

export default StatusPage;
