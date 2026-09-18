import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

const MdxLink = ({
  children,
  href,
  ...properties
}: ComponentPropsWithoutRef<"a">) => {
  if (href?.startsWith("/")) {
    return (
      <Link href={href} {...properties}>
        {children}
      </Link>
    );
  }

  return (
    <a {...properties} href={href} rel="noreferrer">
      {children}
    </a>
  );
};

const components: MDXComponents = {
  a: MdxLink,
};

export const useMDXComponents = (): MDXComponents => components;
