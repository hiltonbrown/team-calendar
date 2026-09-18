declare module "*.mdx" {
  import type { MDXContent } from "mdx/types";

  const Component: MDXContent;
  export const metadata: unknown;
  export default Component;
}
