"use client";

import React, { useMemo } from "react";
import {
  IssueChip,
  UserChip,
  ProjectChip,
  IssueCard,
  IssueList,
  UserWorkloadList,
  DynamicViewCard,
  type IssueData,
  type UserData,
  type ProjectData,
  type DynamicViewData,
} from "./InteractiveElements";

/**
 * Clean all markers and raw JSON from content for display
 */
function cleanAllMarkers(content: string): string {
  let cleaned = content
    // Action markers
    .replace(/\[ACTION:\s*type="[^"]*"\s*params=\{[\s\S]*?\}\s*\]/g, "")
    // Suggestion markers
    .replace(/\[SUGGESTION:\s*title="[^"]*"\s*description="[^"]*"(?:\s*action="[^"]*")?\]/g, "")
    // Tool status messages
    .replace(/\*Searching [^*]+\.\.\.\*/g, "")
    // Interactive markers with JSON - handle both single ] and ]] endings
    .replace(/\[ISSUE_LIST:[\s\S]*?\](?:\])?/g, "")
    .replace(/\[USER_WORKLOAD:[\s\S]*?\](?:\])?/g, "")
    .replace(/\[DYNAMIC_VIEW:\{[\s\S]*?\}\]/g, "")
    // Simple markers
    .replace(/\[ISSUE:[^\]]+\]/g, "")
    .replace(/\[USER:[^\]]+\]/g, "")
    .replace(/\[PROJECT:[^\]]+\]/g, "");

  // Clean up any remaining raw JSON arrays that might have leaked
  // This catches patterns like: [{"key":"..."},{"key":"..."}]
  cleaned = cleaned.replace(/\[\s*\{[^[\]]*"key"[^[\]]*\}(?:\s*,\s*\{[^[\]]*\})*\s*\]/g, "");

  // Clean up partial JSON that might appear
  // Matches patterns like: ,"field":"value"...}] or {"field":"value",...
  cleaned = cleaned.replace(/,?"[a-zA-Z_]+":\s*(?:"[^"]*"|null|\d+|\[[^\]]*\]|\{[^}]*\})(?:,|\}|\])/g, (match) => {
    // Only remove if it looks like orphaned JSON
    if (match.includes('"key"') || match.includes('"title"') || match.includes('"status"')) {
      return "";
    }
    return match;
  });

  // Clean up any lines that are mostly JSON-like garbage
  const lines = cleaned.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    // Skip lines that look like raw JSON fragments
    if (trimmed.startsWith('{"') || trimmed.startsWith(',"') || trimmed.startsWith('["')) {
      return false;
    }
    if (trimmed.match(/^[\[\]\{\},\s]*$/)) {
      return false;
    }
    // Skip lines with excessive JSON-like patterns
    const jsonPatternCount = (trimmed.match(/":"|\d+,"|null,|true,|false,|\[\]|\{\}/g) || []).length;
    if (jsonPatternCount > 3 && trimmed.length < 200) {
      return false;
    }
    return true;
  });

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract interactive data from content
 */
function extractInteractiveData(content: string): {
  issues: IssueData[];
  users: any[];
  dynamicView: DynamicViewData | null;
  inlineIssues: Array<{ index: number; data: IssueData }>;
  inlineUsers: Array<{ index: number; data: UserData }>;
  inlineProjects: Array<{ index: number; data: ProjectData }>;
} {
  const result = {
    issues: [] as IssueData[],
    users: [] as any[],
    dynamicView: null as DynamicViewData | null,
    inlineIssues: [] as Array<{ index: number; data: IssueData }>,
    inlineUsers: [] as Array<{ index: number; data: UserData }>,
    inlineProjects: [] as Array<{ index: number; data: ProjectData }>,
  };

  // Extract ISSUE_LIST data - handle multiline JSON
  const issueListMatch = content.match(/\[ISSUE_LIST:([\s\S]*?)\]\]/);
  if (issueListMatch) {
    try {
      const jsonStr = issueListMatch[1].trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        result.issues = parsed.filter((i: any) => i.key || i.title);
      }
    } catch (e) {
      // Try to extract JSON array from the content
      const arrayMatch = issueListMatch[1].match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) {
            result.issues = parsed.filter((i: any) => i.key || i.title);
          }
        } catch {}
      }
    }
  }

  // Extract USER_WORKLOAD data
  const workloadMatch = content.match(/\[USER_WORKLOAD:([\s\S]*?)\]\]/);
  if (workloadMatch) {
    try {
      const jsonStr = workloadMatch[1].trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        result.users = parsed;
      }
    } catch (e) {
      const arrayMatch = workloadMatch[1].match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) {
            result.users = parsed;
          }
        } catch {}
      }
    }
  }

  // Extract DYNAMIC_VIEW data - format: [DYNAMIC_VIEW:{...}]
  const viewMatch = content.match(/\[DYNAMIC_VIEW:(\{[\s\S]*?\})\]/);
  if (viewMatch) {
    try {
      const jsonStr = viewMatch[1].trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.viewUrl) {
        result.dynamicView = parsed;
      }
    } catch (e) {
      console.error('Failed to parse DYNAMIC_VIEW:', e);
    }
  }

  // Extract inline ISSUE markers
  const issueRegex = /\[ISSUE:([^\]]+)\]/g;
  let match;
  while ((match = issueRegex.exec(content)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (attrs.key || attrs.title) {
      result.inlineIssues.push({
        index: match.index,
        data: {
          key: attrs.key || "",
          title: attrs.title,
          status: attrs.status,
          priority: attrs.priority,
          type: attrs.type,
          assignee: attrs.assignee,
        },
      });
    }
  }

  // Extract inline USER markers
  const userRegex = /\[USER:([^\]]+)\]/g;
  while ((match = userRegex.exec(content)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (attrs.name) {
      result.inlineUsers.push({
        index: match.index,
        data: {
          id: attrs.id,
          name: attrs.name,
          email: attrs.email,
          activeIssues: attrs.activeIssues ? parseInt(attrs.activeIssues) : undefined,
        },
      });
    }
  }

  // Extract inline PROJECT markers
  const projectRegex = /\[PROJECT:([^\]]+)\]/g;
  while ((match = projectRegex.exec(content)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (attrs.name) {
      result.inlineProjects.push({
        index: match.index,
        data: {
          id: attrs.id,
          name: attrs.name,
          prefix: attrs.prefix,
          issueCount: attrs.issueCount ? parseInt(attrs.issueCount) : undefined,
        },
      });
    }
  }

  return result;
}

/**
 * Parse key="value" pairs from attribute string
 */
function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * Render text content with markdown support
 */
function TextContent({ content }: { content: string }) {
  // Split by code blocks first
  const codeBlockRegex = /(```[\s\S]*?```)/g;
  const parts = content.split(codeBlockRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const language = lines[0]?.trim() || "";
          const code = language ? lines.slice(1).join("\n") : lines.join("\n");

          return (
            <pre
              key={i}
              className="bg-black/30 border border-white/[0.08] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"
            >
              {language && (
                <span className="text-[10px] text-white/30 block mb-2 uppercase tracking-wider">
                  {language}
                </span>
              )}
              <code className="text-emerald-300/90">{code}</code>
            </pre>
          );
        }

        return <InlineTextContent key={i} content={part} />;
      })}
    </>
  );
}

/**
 * Render inline text with headers, lists, and formatting
 */
function InlineTextContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Headers
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={i} className="text-sm font-semibold text-white/90 mt-4 mb-2">
              {renderInlineFormatting(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="text-base font-bold text-white mt-4 mb-2">
              {renderInlineFormatting(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={i} className="text-lg font-bold text-white mt-4 mb-2">
              {renderInlineFormatting(trimmed.slice(2))}
            </h2>
          );
        }

        // Bullet lists
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
          const bulletContent = trimmed.slice(2);
          return (
            <div key={i} className="flex items-start gap-2.5 py-0.5 pl-1">
              <span className="text-violet-400/60 mt-1.5 text-[6px]">●</span>
              <span className="flex-1">{renderInlineWithIssueKeys(bulletContent)}</span>
            </div>
          );
        }

        // Numbered lists
        const numberedMatch = trimmed.match(/^(\d+)\.\s/);
        if (numberedMatch) {
          return (
            <div key={i} className="flex items-start gap-2.5 py-0.5 pl-1">
              <span className="text-white/40 text-xs mt-0.5 w-4 text-right font-medium">
                {numberedMatch[1]}.
              </span>
              <span className="flex-1">
                {renderInlineWithIssueKeys(trimmed.slice(numberedMatch[0].length))}
              </span>
            </div>
          );
        }

        // Empty line
        if (!trimmed) {
          return <div key={i} className="h-3" />;
        }

        // Regular text
        return (
          <div key={i} className="py-0.5">
            {renderInlineWithIssueKeys(line)}
          </div>
        );
      })}
    </>
  );
}

/**
 * Render inline formatting (bold, italic, code) and detect issue keys
 */
function renderInlineWithIssueKeys(text: string): React.ReactNode {
  // First, split by issue key pattern
  const issueKeyRegex = /\b([A-Z]{2,10}-[A-Z]?\d+)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = issueKeyRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`}>
          {renderInlineFormatting(text.slice(lastIndex, match.index))}
        </span>
      );
    }

    // Add issue chip
    parts.push(
      <IssueChip key={`i-${match.index}`} data={{ key: match[1] }} />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`t-${lastIndex}`}>
        {renderInlineFormatting(text.slice(lastIndex))}
      </span>
    );
  }

  return parts.length > 0 ? (
    <span className="inline-flex flex-wrap items-center gap-1">{parts}</span>
  ) : (
    renderInlineFormatting(text)
  );
}

/**
 * Render bold, italic, and code formatting
 */
function renderInlineFormatting(text: string): React.ReactNode {
  // Split by formatting patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    // Bold
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Italic
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return (
        <em key={i} className="italic text-white/80">
          {part.slice(1, -1)}
        </em>
      );
    }
    // Inline code
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Main Interactive Content Renderer
 */
export default function InteractiveContentRenderer({
  content,
}: {
  content: string;
}) {
  // Extract interactive data
  const interactiveData = useMemo(() => extractInteractiveData(content), [content]);

  // Clean content for text display
  const cleanedContent = useMemo(() => cleanAllMarkers(content), [content]);

  // Check if we have any interactive elements to show
  const hasIssues = interactiveData.issues.length > 0;
  const hasUsers = interactiveData.users.length > 0;
  const hasDynamicView = interactiveData.dynamicView !== null;

  return (
    <div className="space-y-3">
      {/* Render cleaned text content */}
      {cleanedContent && (
        <div className="leading-relaxed">
          <TextContent content={cleanedContent} />
        </div>
      )}

      {/* Render dynamic view card if present */}
      {hasDynamicView && interactiveData.dynamicView && (
        <div className="mt-4">
          <DynamicViewCard data={interactiveData.dynamicView} />
        </div>
      )}

      {/* Render issue list if present */}
      {hasIssues && (
        <div className="mt-4">
          <IssueList issues={interactiveData.issues} />
        </div>
      )}

      {/* Render user workload if present */}
      {hasUsers && (
        <div className="mt-4">
          <UserWorkloadList users={interactiveData.users} />
        </div>
      )}
    </div>
  );
}
