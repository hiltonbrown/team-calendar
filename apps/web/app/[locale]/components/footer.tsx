import Image from "next/image";
import Link from "next/link";

const footerColumns = [
  {
    title: "Product",
    items: [
      { title: "Calendar subscriptions", href: "/features#ics-feeds" },
      { title: "Xero integration", href: "/integrations/xero" },
      { title: "Approvals", href: "/features#leave-workflow" },
      { title: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Company",
    items: [
      { title: "About", href: "/contact" },
      { title: "Customers", href: "/features" },
      { title: "Blog", href: "/blog" },
      { title: "Careers", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    items: [
      { title: "Security", href: "/security" },
      { title: "Status", href: "/changelog" },
      { title: "Help centre", href: "/blog" },
      { title: "Contact", href: "/contact" },
    ],
  },
];

export const Footer = () => (
  <footer className="marketing-footer">
    <div className="marketing-footer__grid">
      <div>
        <Image
          alt="LeaveSync"
          height={40}
          src="/marketing/features-logo-dark.svg"
          width={40}
        />
        <p>
          Team availability, synced from Xero Payroll and published to the
          calendars your people already use.
        </p>
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
      <span>© 2026 LeaveSync. Built on the Gold Coast.</span>
      <span>Privacy · Terms · Data processing</span>
    </div>
  </footer>
);
