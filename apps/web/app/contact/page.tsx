import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { ContactForm } from "./components/contact-form";

export const metadata: Metadata = createMetadata({
  title: "Get in touch",
  description:
    "Talk to us about connecting LeaveSync to your Xero Payroll account.",
});

const Contact = () => <ContactForm />;

export default Contact;
