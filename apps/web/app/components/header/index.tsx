"use client";

import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { brandNameDisplay } from "@repo/seo/branding";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signInHref, signUpHref } from "@/src/lib/auth-links";

const navLinks = [
  { href: "/", title: "Home" },
  { href: "/features", title: "Features" },
  { href: "/integrations", title: "Integrations" },
  { href: "/pricing", title: "Pricing" },
  { href: "/contact", title: "Contact" },
];

const isRouteActive = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === "/";
  }

  const normalisedPathname = pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  return (
    normalisedPathname === href || normalisedPathname.startsWith(`${href}/`)
  );
};

export const Header = () => {
  const [isOpen, setOpen] = useState(false);
  const pathname = usePathname();
  const mobileNavigationId = "marketing-mobile-navigation";
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        mobileMenuTriggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <a className="marketing-skip-link" href="#main-content">
        Skip to main content
      </a>
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
              const isActive = isRouteActive(pathname, link.href);

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

          <div className="marketing-site-header__controls">
            <div className="marketing-site-header__theme">
              <ModeToggle />
            </div>
            <button
              aria-controls={mobileNavigationId}
              aria-expanded={isOpen}
              aria-label="Toggle navigation"
              className="marketing-site-header__toggle"
              onClick={() => setOpen((current) => !current)}
              ref={mobileMenuTriggerRef}
              type="button"
            >
              {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>

          <nav
            aria-label="Mobile"
            className="marketing-site-header__mobile"
            data-open={isOpen ? "true" : "false"}
            id={mobileNavigationId}
          >
            {navLinks.map((link) => {
              const isActive = isRouteActive(pathname, link.href);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? "is-active" : ""}
                  href={link.href}
                  key={link.href}
                  onClick={() => setOpen(false)}
                >
                  {link.title}
                </Link>
              );
            })}
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
            <div className="marketing-site-header__mobile-theme">
              <span className="marketing-site-header__mobile-theme-label">
                Theme
              </span>
              <ModeToggle />
            </div>
          </nav>

          <noscript>
            <nav
              aria-label="Mobile navigation without JavaScript"
              className="marketing-site-header__noscript"
            >
              {navLinks.map((link) => {
                const isActive = isRouteActive(pathname, link.href);

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
    </>
  );
};
