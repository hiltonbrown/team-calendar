import type { Blog, WithContext } from "@repo/seo/json-ld";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/src/lib/blog";

const blogMeta = {
  title: "Blog",
  description: "Updates, guides, and articles from the LeaveSync team.",
};

export const generateMetadata = (): Metadata => createMetadata(blogMeta);

const BlogIndex = async () => {
  const posts = await getAllPosts();

  const jsonLd: WithContext<Blog> = {
    "@type": "Blog",
    "@context": "https://schema.org",
  };

  return (
    <>
      <JsonLd code={jsonLd} />
      <div className="w-full py-20 lg:py-40">
        <div className="container mx-auto flex flex-col gap-14">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="max-w-xl font-semibold text-3xl tracking-tight md:text-5xl">
              {blogMeta.title}
            </h1>
            <p className="text-base text-muted-foreground">
              {blogMeta.description}
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-muted p-8">
              <p className="font-medium text-base">No posts yet</p>
              <p className="text-muted-foreground text-sm">
                Check back soon for updates, guides, and articles from the
                LeaveSync team.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {posts.map((post, index) => (
                <Link
                  className={[
                    "flex cursor-pointer flex-col gap-4 rounded-2xl bg-muted p-6 transition-colors hover:bg-muted/80",
                    index === 0 ? "md:col-span-2" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  href={`/blog/${post.slug}`}
                  key={post.slug}
                >
                  <div className="flex items-center gap-3">
                    <time
                      className="text-muted-foreground text-sm"
                      dateTime={post.frontmatter.date}
                    >
                      {new Date(post.frontmatter.date).toLocaleDateString(
                        "en-AU",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }
                      )}
                    </time>
                    {post.frontmatter.author && (
                      <>
                        <span className="text-muted-foreground text-sm">
                          &middot;
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {post.frontmatter.author}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <h2
                      className={`font-semibold tracking-tight ${index === 0 ? "text-3xl" : "text-xl"}`}
                    >
                      {post.frontmatter.title}
                    </h2>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      {post.frontmatter.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BlogIndex;
