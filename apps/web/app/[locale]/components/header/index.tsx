"use client";

import type { Dictionary } from "@repo/internationalization";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { env } from "@/env";

interface HeaderProps {
  dictionary: Dictionary;
}

const signInHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-in`
  : "/";
const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const navLinks = [
  { title: "Home", href: "/" },
  { title: "Features", href: "/features" },
  { title: "Integrations", href: "/integrations/xero" },
  { title: "Pricing", href: "/pricing" },
];

export const Header = (_properties: HeaderProps) => {
  const [isOpen, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="marketing-site-header">
      <div className="marketing-glass marketing-site-header__inner">
        <Link className="marketing-site-header__brand" href="/">
          <Image
            alt=""
            height={28}
            src="/marketing/brand-mark.svg"
            width={28}
          />
          <span>LeaveSync</span>
        </Link>

        <nav className="marketing-site-header__nav">
          {navLinks.map((link) => (
            <Link
              className={pathname?.endsWith(link.href) ? "is-active" : ""}
              href={link.href}
              key={link.href}
            >
              {link.title}
            </Link>
          ))}
        </nav>

        <div className="marketing-site-header__actions">
          <Link
            className="marketing-btn marketing-btn--tertiary"
            href={signInHref}
          >
            Sign in
          </Link>
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Start trial
          </Link>
        </div>

        <button
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          className="marketing-site-header__toggle"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        {isOpen && (
          <div className="marketing-site-header__mobile">
            {navLinks.map((link) => (
              <Link
                href={link.href}
                key={link.href}
                onClick={() => setOpen(false)}
              >
                {link.title}
              </Link>
            ))}
            <Link href={signInHref} onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link
              className="marketing-btn marketing-btn--primary"
              href={signUpHref}
              onClick={() => setOpen(false)}
            >
              Start trial
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};
