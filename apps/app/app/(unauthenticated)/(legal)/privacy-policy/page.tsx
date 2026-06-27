import { brandNameDisplay, primaryDomain } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import {
  LegalDocument,
  LegalList,
  LegalParagraph,
  LegalSection,
} from "../components/legal-prose";

const title = "Privacy Policy";
const description = `How ${brandNameDisplay} collects, uses, and protects your information.`;

export const metadata: Metadata = createMetadata({ title, description });

const PrivacyPolicyPage = () => (
  <LegalDocument
    intro={`This policy explains what information ${brandNameDisplay} collects, how we use it, and the choices you have. It applies to people who use the service through their organisation.`}
    lastUpdated="27 June 2026"
    title={title}
  >
    <LegalSection heading="Information we collect">
      <LegalList>
        <li>
          Account and identity details from your sign-in provider, such as your
          name, email address, and organisation membership.
        </li>
        <li>
          Leave and availability records you create, including dates, leave
          types, and any notes you add.
        </li>
        <li>
          Employee and leave data synchronised from your organisation&apos;s
          Xero account.
        </li>
        <li>
          Operational data such as logs and error reports used to keep the
          service secure and reliable.
        </li>
      </LegalList>
    </LegalSection>

    <LegalSection heading="How we use information">
      <LegalParagraph>
        We use your information to operate {brandNameDisplay}: to process leave
        requests and approvals, synchronise approved leave with Xero, publish
        availability to the calendar feeds your organisation configures, send
        notifications you have opted into, and maintain the security and
        integrity of the service. We do not sell your personal information.
      </LegalParagraph>
    </LegalSection>

    <LegalSection heading="How we share information">
      <LegalParagraph>
        Your availability is visible to other members of your organisation in
        line with the privacy rules your organisation sets, and is published to
        any calendar feeds it has enabled. We share data with the service
        providers that run the platform, including our authentication, database,
        payroll integration, email, and monitoring providers, only as needed to
        deliver the service. We may also disclose information where required by
        law.
      </LegalParagraph>
    </LegalSection>

    <LegalSection heading="Data security">
      <LegalParagraph>
        We protect data in line with industry practice. Access to your
        organisation&apos;s data is isolated to that organisation, payroll
        connection tokens are encrypted at rest, and calendar feed links are
        signed and can be revoked. No system is perfectly secure, so we cannot
        guarantee absolute security.
      </LegalParagraph>
    </LegalSection>

    <LegalSection heading="Data retention">
      <LegalParagraph>
        We keep your information for as long as your organisation uses the
        service and as needed to meet legal and operational obligations. When an
        organisation stops using {brandNameDisplay}, its data is removed or
        anonymised within a reasonable period, unless we are required to retain
        it.
      </LegalParagraph>
    </LegalSection>

    <LegalSection heading="Your choices">
      <LegalParagraph>
        You can review and update much of your information within the product,
        and adjust your notification preferences at any time. For requests to
        access, correct, or delete personal information held about you, contact
        your organisation administrator or us at the address below.
      </LegalParagraph>
    </LegalSection>

    <LegalSection heading="Contact">
      <LegalParagraph>
        Questions about this policy or your data can be sent to privacy@
        {primaryDomain}.
      </LegalParagraph>
    </LegalSection>
  </LegalDocument>
);

export default PrivacyPolicyPage;
