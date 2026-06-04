import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MdxContent } from "@/src/components/mdx-content";
import { getAllPosts, getPost } from "@/src/lib/blog";

interface BlogPostProperties {
  readonly params: Promise<{
    slug: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: BlogPostProperties): Promise<Metadata> => {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return {};
  }

  return createMetadata({
    title: post.frontmatter.title,
    description: post.frontmatter.description,
  });
};

export const generateStaticParams = async (): Promise<{ slug: string }[]> => {
  const posts = await getAllPosts();
  return posts.map(({ slug }) => ({ slug }));
};

const BlogPost = async ({ params }: BlogPostProperties) => {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="container mx-auto py-16">
      <Link
        className="mb-8 inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground focus:underline focus:outline-none"
        href="/blog"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Blog
      </Link>

      <div className="mt-8 flex flex-col gap-6 lg:max-w-2xl">
        <div className="flex items-center gap-3">
          <time
            className="text-muted-foreground text-sm"
            dateTime={post.frontmatter.date}
          >
            {new Date(post.frontmatter.date).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
          {post.frontmatter.author && (
            <>
              <span className="text-muted-foreground text-sm">&middot;</span>
              <span className="text-muted-foreground text-sm">
                {post.frontmatter.author}
              </span>
            </>
          )}
        </div>

        <h1 className="font-semibold text-4xl tracking-tight lg:text-5xl">
          {post.frontmatter.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {post.frontmatter.description}
        </p>

        <hr className="border-border" />

        <MdxContent code={post.code} />
      </div>
    </div>
  );
};

export default BlogPost;
