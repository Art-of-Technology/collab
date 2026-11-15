"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import "highlight.js/styles/github.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Ids for the page's h2 and h3 headings, in document order (the docs loader's list). */
  headingIds?: string[];
}

// Runs after the sanitizer, which would prefix an id. Only headings at the top level of the page count,
// as in the loader. A heading's trailing {#id} marker chose the id and is not shown.
const withHeadingIds = (ids: string[]) => () => (tree: any) => {
  let next = 0;
  for (const node of tree.children) {
    if (node.type !== "element" || (node.tagName !== "h2" && node.tagName !== "h3")) continue;
    const id = ids[next++];
    if (!id) continue;
    node.properties.id = id;
    const last = node.children.at(-1);
    const text = last?.type === "text" ? last.value.trimEnd() : "";
    if (text.endsWith(`{#${id}}`)) last.value = text.slice(0, -id.length - 3).trimEnd();
  }
};

export function MarkdownRenderer({ content, className = "", headingIds }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSanitize, ...(headingIds ? [withHeadingIds(headingIds)] : [])]}
        components={{
          // Custom styling for different markdown elements
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mb-4 text-foreground">{children}</h1>
          ),
          h2: ({ children, id }) => (
            <h2 id={id} className="text-xl font-semibold mb-3 text-foreground">{children}</h2>
          ),
          h3: ({ children, id }) => (
            <h3 id={id} className="text-lg font-medium mb-2 text-foreground">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 text-foreground leading-relaxed">{children}</p>
          ),
          code: ({ node, className, children, ...props }: any) => {
            // A code block is one line or more ending in a line break, or carries its language; code in a sentence has neither.
            if (!className && !String(children).endsWith("\n")) {
              return (
                <code
                  className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={`block bg-muted p-3 rounded-lg overflow-x-auto text-sm font-mono ${className}`}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-muted p-3 rounded-lg overflow-x-auto mb-4">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground my-4">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-1 text-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-1 text-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground">{children}</li>
          ),
          a: ({ children, href }) => {
            const isInternalLink = href?.startsWith('#');
            // A page of this site opens in the same tab; another site opens a new one.
            const sameTab = isInternalLink || /^\/(?!\/)/.test(href ?? '');
            return (
              <a
                href={href || '#'}
                className="text-primary hover:underline"
                target={sameTab ? undefined : "_blank"}
                rel={sameTab ? undefined : "noopener noreferrer"}
                onClick={(e) => {
                  if (isInternalLink && href) {
                    e.preventDefault();
                    window.location.hash = href;
                  }
                }}
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border border-border rounded-lg">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 bg-muted font-semibold text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2">{children}</td>
          ),
          hr: () => <hr className="border-border my-6" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
} 