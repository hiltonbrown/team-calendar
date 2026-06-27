"use client";

import { brandNameDisplay } from "@repo/seo/branding";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { env } from "@/env";

const signInHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-in`
  : "/";
const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";

const navLinks = [
  { title: "Home", href: "/" },
  { title: "Features", href: "/features" },
  { title: "Integrations", href: "/integrations" },
  { title: "Pricing", href: "/pricing" },
];

export const Header = () => {
  const [isOpen, setOpen] = useState(false);
  const pathname = usePathname();
  const mobileNavigationId = "marketing-mobile-navigation";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

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
          <span>{brandNameDisplay}</span>
        </Link>

        <nav aria-label="Primary" className="marketing-site-header__nav">
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(link.href);

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "is-active" : ""}
                href={link.href}
                key={link.href}
              >
                {link.title}
              </Link>
            );
          })}
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
            Sign up
          </Link>
        </div>

        <button
          aria-controls={mobileNavigationId}
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          className="marketing-site-header__toggle"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <nav
          aria-label="Mobile"
          className="marketing-site-header__mobile"
          data-open={isOpen ? "true" : "false"}
          id={mobileNavigationId}
        >
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
            Sign up
          </Link>
        </nav>

        <noscript>
          <nav
            aria-label="Mobile navigation without JavaScript"
            className="marketing-site-header__noscript"
          >
            {navLinks.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.title}
              </Link>
            ))}
            <Link href={signInHref}>Sign in</Link>
            <Link
              className="marketing-btn marketing-btn--primary"
              href={signUpHref}
            >
              Sign up
            </Link>
          </nav>
        </noscript>
      </div>
    </header>
  );
};
