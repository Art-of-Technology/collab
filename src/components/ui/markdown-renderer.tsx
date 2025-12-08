"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import "highlight.js/styles/github.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSanitize]}
        components={{
          // Custom styling for different markdown elements
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mb-4 text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold mb-3 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-medium mb-2 text-foreground">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 text-foreground leading-relaxed">{children}</p>
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
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
            return (
              <a
                href={href || '#'}
                className="text-primary hover:underline"
                target={isInternalLink ? undefined : "_blank"}
                rel={isInternalLink ? undefined : "noopener noreferrer"}
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