import "./contact.css";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { ContactPageContent } from "./components/contact-page-content";

export const metadata: Metadata = createMetadata({
  description:
    "Contact Team Calendar with an enquiry, apply for Australian early access, get support or report a bug.",
  title: "Get in touch",
});

const Contact = async ({
  searchParams,
}: {
  searchParams: Promise<{ admission?: string }>;
}) => {
  const params = await searchParams;
  return (
    <ContactPageContent
      initialType={params.admission === "required" ? "early-access" : "enquiry"}
    />
  );
};

export default Contact;
