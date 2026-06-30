import { brandNameDisplay } from "@repo/seo/branding";
import Image from "next/image";
import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";

const footerColumns = [
  {
    title: "Product",
    items: [
      { title: "Calendar feeds", href: "/features#ics-feeds" },
      { title: "Leave approvals", href: "/features#leave-workflow" },
      { title: "Xero integration", href: "/integrations" },
      { title: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "About", href: "/about" },
      { title: "Customers", href: "/customers" },
      { title: "Blog", href: "/blog" },
      { title: "Careers", href: "/careers" },
    ],
  },
  {
    title: "Resources",
    items: [
      { title: "Security", href: "/security" },
      { title: "Status", href: "/status" },
      { title: "Help centre", href: "/help-centre" },
      { title: "Contact", href: "/contact" },
      { title: "Changelog", href: "/changelog" },
    ],
  },
];

const legalLinks = [
  { title: "Privacy", href: "/privacy-policy" },
  { title: "Terms", href: "/terms-of-service" },
];

export const Footer = () => (
  <footer className="marketing-footer">
    <div className="marketing-footer__grid">
      <div className="marketing-footer__brand">
        <Image
          alt={brandNameDisplay}
          className="marketing-footer__wordmark"
          height={42}
          src="/marketing/brand-wordmark-inverse.svg"
          width={168}
        />
        <p>
          Team availability, synced from Xero Payroll and published to the
          calendars your people already use.
        </p>
        <p className="marketing-footer__proof">
          Built for Xero Payroll teams in Australia, New Zealand, and the United
          Kingdom.
        </p>
        <div className="marketing-footer__actions">
          <Link className="marketing-footer__primary-link" href={signUpHref}>
            Sign up
          </Link>
          <Link className="marketing-footer__secondary-link" href="/contact">
            Talk to us
          </Link>
        </div>
      </div>
      {footerColumns.map((column) => (
        <div className="marketing-footer__column" key={column.title}>
          <h2>{column.title}</h2>
          {column.items.map((item) => (
            <Link href={item.href} key={item.title}>
              {item.title}
            </Link>
          ))}
        </div>
      ))}
    </div>
    <div className="marketing-footer__bottom">
      <span>© 2026 {brandNameDisplay}. Built on the Gold Coast.</span>
      <nav aria-label="Legal" className="marketing-footer__legal">
        {legalLinks.map((item) => (
          <Link href={item.href} key={item.title}>
            {item.title}
          </Link>
        ))}
      </nav>
    </div>
  </footer>
);
