import { brandNameDisplay, primaryDomain } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import {
  LegalDocument,
  LegalList,
  LegalParagraph,
  LegalSection,
} from "../components/legal-prose";

const title = "Terms of Service";
const description = `The terms that govern your use of ${brandNameDisplay}.`;

export const metadata: Metadata = createMetadata({ title, description });

const TermsOfServicePage = () => (
  <div className="fmkt-page marketing-simple marketing-legal">
    <main className="marketing-legal__main">
      <div className="fmkt-container">
        <LegalDocument
          intro={`These terms govern your access to and use of ${brandNameDisplay}, a leave management and availability publishing platform. By using the service you agree to them.`}
          lastUpdated="27 June 2026"
          title={title}
        >
          <LegalSection heading="Who can use the service">
            <LegalParagraph>
              {brandNameDisplay} is provided to organisations and their members.
              You may use it only as part of an organisation that has an active
              subscription, and only in the role assigned to you by your
              organisation administrator. You are responsible for keeping your
              sign-in credentials secure and for activity that occurs under your
              account.
            </LegalParagraph>
          </LegalSection>

          <LegalSection heading="What the service does">
            <LegalParagraph>
              {brandNameDisplay} lets employees submit and manage leave
              requests, synchronises approved leave with Xero Payroll, records
              non-leave availability such as working from home or travel, and
              publishes availability to secure calendar feeds. Xero remains the
              source of truth for payroll and leave balances. We do not
              calculate balances, accruals, or pay.
            </LegalParagraph>
          </LegalSection>

          <LegalSection heading="Your responsibilities">
            <LegalList>
              <li>
                Provide accurate information when submitting leave and
                availability.
              </li>
              <li>
                Use the service in line with your organisation&apos;s policies
                and applicable law.
              </li>
              <li>
                Keep calendar feed links private, as anyone with a feed link can
                view the availability it publishes.
              </li>
              <li>
                Do not attempt to access data belonging to other organisations
                or to disrupt the service.
              </li>
            </LegalList>
          </LegalSection>

          <LegalSection heading="Connecting Xero">
            <LegalParagraph>
              When your organisation connects {brandNameDisplay} to Xero, you
              authorise us to read leave and employee data from your Xero
              organisation and to write approved leave changes back to it. You
              can disconnect Xero at any time from your organisation settings.
              Your use of Xero is also governed by Xero&apos;s own terms.
            </LegalParagraph>
          </LegalSection>

          <LegalSection heading="Availability and changes">
            <LegalParagraph>
              We aim to keep the service available but do not guarantee
              uninterrupted access. We may update, suspend, or withdraw
              features, and we will give reasonable notice of material changes
              to these terms where we can. Your continued use after a change
              takes effect means you accept the updated terms.
            </LegalParagraph>
          </LegalSection>

          <LegalSection heading="Liability">
            <LegalParagraph>
              The service is provided on an &quot;as is&quot; basis. To the
              extent permitted by law, we are not liable for indirect or
              consequential loss, or for loss arising from inaccurate data
              sourced from or written to Xero. Nothing in these terms limits
              rights that cannot be excluded under applicable law.
            </LegalParagraph>
          </LegalSection>

          <LegalSection heading="Contact">
            <LegalParagraph>
              {`Questions about these terms can be sent to support@${primaryDomain}.`}
            </LegalParagraph>
          </LegalSection>
        </LegalDocument>
      </div>
    </main>
  </div>
);

export default TermsOfServicePage;
