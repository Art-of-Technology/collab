"use client";

import React, { useMemo, useState } from "react";
import {
  User,
  Copy,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Wrench,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ContentBlock } from "@/context/AIContext";
import { IssueChip, IssueList, type IssueData } from "./InteractiveElements";
import ToolResultRenderer from "./ToolResultRenderer";

// ─── Issue Key Validation ───

/** Validate a string looks like an issue key (e.g. CLB-389, ABC-E4) */
const ISSUE_KEY_PATTERN = /^[A-Z]{2,10}-[A-Z]?\d+$/;

// ─── Issue Data Map Builder ───

/** Extract issue key→data map from all tool_result blocks (for enriching inline IssueChips) */
function buildIssueDataMap(blocks: ContentBlock[]): Map<string, IssueData> {
  const map = new Map<string, IssueData>();

  const addIssue = (obj: Record<string, unknown>) => {
    const key = (obj.issueKey || obj.key || obj.identifier || "") as string;
    if (!key || !ISSUE_KEY_PATTERN.test(key)) return;

    const assignee = obj.assignee;
    const assigneeName =
      typeof assignee === "object" && assignee !== null
        ? ((assignee as Record<string, unknown>).name as string) || ""
        : ((assignee || obj.assigneeName || "") as string);

    const project = obj.project;
    const projectName =
      typeof project === "object" && project !== null
        ? ((project as Record<string, unknown>).name as string) || ""
        : ((project || obj.projectName || "") as string);

    map.set(key, {
      key,
      title: (obj.title || obj.name || obj.summary || "") as string,
      status: (obj.status || obj.state || "") as string,
      priority: (obj.priority || "") as string,
      type: (obj.type || "") as string,
      assignee: assigneeName,
      project: projectName,
    });
  };

  for (const block of blocks) {
    if (block.type !== "tool_result" || !block.content) continue;
    try {
      const parsed = JSON.parse(block.content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object")
            addIssue(item as Record<string, unknown>);
        }
      } else if (parsed && typeof parsed === "object") {
        addIssue(parsed as Record<string, unknown>);
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.issues)) {
          for (const item of obj.issues as Array<Record<string, unknown>>) {
            addIssue(item);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return map;
}

// ─── Markdown Text Rendering ───

/** Render bold, italic, and inline code */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return (
        <em key={i} className="italic text-white/80">
          {part.slice(1, -1)}
        </em>
      );
    }
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

/** Split a text segment by issue keys, returning chips interspersed with plain text */
function renderIssueKeysInSegment(
  text: string,
  issueMap?: Map<string, IssueData>,
  prefix: string = ""
): { nodes: React.ReactNode; hasKeys: boolean } {
  const issueKeyRegex = /\b([A-Z]{2,10}-[A-Z]?\d+)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let hasKeys = false;

  while ((match = issueKeyRegex.exec(text)) !== null) {
    hasKeys = true;
    if (match.index > lastIndex) {
      parts.push(
        <span key={`${prefix}-t-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }
    const enrichedData = issueMap?.get(match[1]) || { key: match[1] };
    parts.push(
      <IssueChip key={`${prefix}-i-${match.index}`} data={enrichedData} />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`${prefix}-t-${lastIndex}`}>{text.slice(lastIndex)}</span>
    );
  }

  return {
    nodes: parts.length > 0 ? <>{parts}</> : <>{text}</>,
    hasKeys,
  };
}

/**
 * Detect issue keys and render as chips with proper inline formatting support.
 * Processes formatting markers (**bold**, *italic*, `code`) FIRST so that issue
 * key extraction doesn't break markdown boundaries like **epic (CLB-388)**.
 */
function renderInlineWithIssueKeys(
  text: string,
  issueMap?: Map<string, IssueData>
): React.ReactNode {
  // Split by formatting markers first, then detect issue keys within each segment
  const formatParts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  const result: React.ReactNode[] = [];
  let hasIssueKey = false;

  formatParts.forEach((part, pi) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      const chips = renderIssueKeysInSegment(inner, issueMap, `b${pi}`);
      if (chips.hasKeys) hasIssueKey = true;
      result.push(
        <strong key={`f-${pi}`} className="font-semibold text-white">
          {chips.nodes}
        </strong>
      );
    } else if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      const inner = part.slice(1, -1);
      const chips = renderIssueKeysInSegment(inner, issueMap, `i${pi}`);
      if (chips.hasKeys) hasIssueKey = true;
      result.push(
        <em key={`f-${pi}`} className="italic text-white/80">
          {chips.nodes}
        </em>
      );
    } else if (part.startsWith("`") && part.endsWith("`")) {
      result.push(
        <code
          key={`f-${pi}`}
          className="bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else if (part) {
      const chips = renderIssueKeysInSegment(part, issueMap, `t${pi}`);
      if (chips.hasKeys) hasIssueKey = true;
      result.push(
        <React.Fragment key={`f-${pi}`}>{chips.nodes}</React.Fragment>
      );
    }
  });

  if (!result.length) return <>{text}</>;

  return hasIssueKey ? (
    <span className="inline-flex flex-wrap items-center gap-1">{result}</span>
  ) : (
    <>{result}</>
  );
}

// ─── Markdown Table → Rich Component Detection ───

/** Check if a line belongs to a markdown table */
function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.split("|").length >= 3;
}

function isSeparatorLine(line: string): boolean {
  return /^\|[\s\-:|]+\|?\s*$/.test(line.trim());
}

/** Parse markdown table rows into IssueData[] — returns null if not issue data */
function parseTableAsIssues(lines: string[]): IssueData[] | null {
  if (lines.length < 3) return null;

  const parseRow = (line: string): string[] =>
    line.split("|").map((c) => c.trim()).filter(Boolean);

  const headers = parseRow(lines[0]);
  if (headers.length < 2) return null;
  if (!isSeparatorLine(lines[1])) return null;

  const find = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const keyCol    = find(/^(key|id|issue\s*key|identifier|#)$/i);
  const titleCol  = find(/^(title|name|summary|description)$/i);
  const prioCol   = find(/^(priority|prio)$/i);
  const statusCol = find(/^(status|state)$/i);
  const assignCol = find(/^(assignee|assigned|owner)$/i);
  const projCol   = find(/^(project)$/i);

  const strip = (s: string) => s.replace(/[`*_~[\]]/g, "").trim();
  const issues: IssueData[] = [];

  for (let i = 2; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells.length < 2) continue;

    const cell = (idx: number) =>
      idx >= 0 && cells[idx] ? strip(cells[idx]) : "";

    let key = cell(keyCol);
    const title = cell(titleCol);

    // Validate key looks like an actual issue key — not just a row number from a # column
    if (key && !ISSUE_KEY_PATTERN.test(key)) {
      key = "";
    }

    // If no valid key from header column, scan cells for an issue key pattern
    if (!key) {
      for (const c of cells) {
        const m = strip(c).match(/\b([A-Z]{2,10}-[A-Z]?\d+)\b/);
        if (m) { key = m[1]; break; }
      }
    }

    if (key || title) {
      issues.push({
        key,
        title,
        priority: cell(prioCol),
        status: cell(statusCol),
        assignee: cell(assignCol),
        project: cell(projCol),
      });
    }
  }

  return issues.some((i) => i.key) ? issues : null;
}

/** Styled HTML table for non-issue markdown tables */
function StyledMarkdownTable({
  lines,
  issueMap,
}: {
  lines: string[];
  issueMap?: Map<string, IssueData>;
}) {
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] =>
    line.split("|").map((c) => c.trim()).filter(Boolean);

  const headers = parseRow(lines[0]);
  const startIdx = isSeparatorLine(lines[1]) ? 2 : 1;
  const dataRows = lines.slice(startIdx).map(parseRow);

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-collab-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-collab-700 bg-collab-800/60">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider"
              >
                {renderInlineFormatting(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-collab-700/50 last:border-0 hover:bg-collab-800/30 transition-colors"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-sm text-collab-50">
                  {renderInlineWithIssueKeys(cell, issueMap)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render a single text line (header, bullet, numbered, or plain) */
function renderTextLine(
  line: string,
  key: string | number,
  issueMap?: Map<string, IssueData>
): React.ReactNode {
  const trimmed = line.trim();

  if (trimmed.startsWith("### ")) {
    return (
      <h4 key={key} className="text-sm font-semibold text-white/90 mt-4 mb-2">
        {renderInlineFormatting(trimmed.slice(4))}
      </h4>
    );
  }
  if (trimmed.startsWith("## ")) {
    return (
      <h3 key={key} className="text-base font-bold text-white mt-4 mb-2">
        {renderInlineFormatting(trimmed.slice(3))}
      </h3>
    );
  }
  if (trimmed.startsWith("# ")) {
    return (
      <h2 key={key} className="text-lg font-bold text-white mt-4 mb-2">
        {renderInlineFormatting(trimmed.slice(2))}
      </h2>
    );
  }

  if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
    return (
      <div key={key} className="flex items-start gap-2.5 py-0.5 pl-1">
        <span className="text-violet-400/60 mt-1.5 text-[6px]">●</span>
        <span className="flex-1">{renderInlineWithIssueKeys(trimmed.slice(2), issueMap)}</span>
      </div>
    );
  }

  const numberedMatch = trimmed.match(/^(\d+)\.\s/);
  if (numberedMatch) {
    return (
      <div key={key} className="flex items-start gap-2.5 py-0.5 pl-1">
        <span className="text-white/40 text-xs mt-0.5 w-4 text-right font-medium">
          {numberedMatch[1]}.
        </span>
        <span className="flex-1">
          {renderInlineWithIssueKeys(trimmed.slice(numberedMatch[0].length), issueMap)}
        </span>
      </div>
    );
  }

  if (!trimmed) {
    return <div key={key} className="h-3" />;
  }

  return (
    <div key={key} className="py-0.5">
      {renderInlineWithIssueKeys(line, issueMap)}
    </div>
  );
}

/** Render inline text content — detects markdown tables and renders them as rich components */
function InlineTextContent({
  content,
  issueMap,
}: {
  content: string;
  issueMap?: Map<string, IssueData>;
}) {
  const lines = content.split("\n");

  // Group consecutive lines into table vs text segments
  type Segment = { type: "text" | "table"; lines: string[] };
  const segments: Segment[] = [];

  for (const line of lines) {
    const isTable = isTableLine(line) || isSeparatorLine(line);
    const segType = isTable ? "table" : "text";
    const last = segments[segments.length - 1];

    if (last?.type === segType) {
      last.lines.push(line);
    } else {
      segments.push({ type: segType, lines: [line] });
    }
  }

  return (
    <>
      {segments.map((seg, si) => {
        if (seg.type === "table") {
          // Try rendering as interactive issue list
          const issues = parseTableAsIssues(seg.lines);
          if (issues && issues.length > 0) {
            return <IssueList key={si} issues={issues} />;
          }
          // Fallback: styled HTML table
          return <StyledMarkdownTable key={si} lines={seg.lines} issueMap={issueMap} />;
        }
        // Regular text lines
        return (
          <React.Fragment key={si}>
            {seg.lines.map((line, li) => renderTextLine(line, `${si}-${li}`, issueMap))}
          </React.Fragment>
        );
      })}
    </>
  );
}

/** Render text with code blocks */
function TextContent({
  content,
  issueMap,
}: {
  content: string;
  issueMap?: Map<string, IssueData>;
}) {
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
        return <InlineTextContent key={i} content={part} issueMap={issueMap} />;
      })}
    </>
  );
}

// ─── Block Renderers ───

function TextBlock({
  text,
  issueMap,
}: {
  text: string;
  issueMap?: Map<string, IssueData>;
}) {
  // Strip action markers from display
  const cleaned = text
    .replace(/\[ACTION:\s*type="[^"]*"\s*params=\{[\s\S]*?\}\s*\]/g, "")
    .replace(/\[SUGGESTION:[^\]]+\]/g, "")
    .trim();

  if (!cleaned) return null;

  return (
    <div className="leading-relaxed">
      <TextContent content={cleaned} issueMap={issueMap} />
    </div>
  );
}

/** Collapsible tool call: "Used X" line with expandable result card */
function CollapsibleToolCall({
  startBlock,
  resultBlock,
}: {
  startBlock: ContentBlock;
  resultBlock?: ContentBlock;
}) {
  const [isOpen, setIsOpen] = useState(!!resultBlock?.isError);

  const displayName = (startBlock.toolName || "tool")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const hasResult = !!resultBlock;
  const isError = resultBlock?.isError;
  const isWebSearch = startBlock.toolType === "web_search";

  return (
    <div>
      <button
        type="button"
        onClick={() => hasResult && setIsOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 py-1 text-xs text-white/30 w-full text-left",
          hasResult && "cursor-pointer hover:text-white/50 transition-colors"
        )}
      >
        {hasResult ? (
          isError ? (
            <XCircle className="w-3.5 h-3.5 text-red-400/60 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
          )
        ) : (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-white/25 shrink-0" />
        )}
        {isWebSearch ? (
          <Globe className="w-3 h-3 text-cyan-400/60 shrink-0" />
        ) : (
          <Wrench className="w-3 h-3 text-white/20 shrink-0" />
        )}
        <span className="flex-1">
          {hasResult ? "Used" : "Using"}{" "}
          <span className={cn("font-medium", isError ? "text-red-400/60" : "text-white/40")}>
            {displayName}
          </span>
        </span>
        {hasResult && (
          <ChevronRight
            className={cn(
              "w-3 h-3 text-white/20 shrink-0 transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
        )}
      </button>
      {isOpen && resultBlock && (
        <div className="ml-[22px] mt-1">
          <ToolResultRenderer
            toolName={resultBlock.toolName || "unknown_tool"}
            content={resultBlock.content || ""}
            isError={resultBlock.isError}
            toolUseId={resultBlock.toolUseId}
          />
        </div>
      )}
    </div>
  );
}

function WebSearchResultsBlock({ block }: { block: ContentBlock }) {
  const results = block.results || [];

  if (results.length === 0) return null;

  return (
    <div className="my-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-white/30 mb-2">
        <Globe className="w-3 h-3 text-cyan-400/60" />
        <span>{results.length} source{results.length !== 1 ? "s" : ""} found</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {results.slice(0, 5).map((result, i) => (
          <a
            key={i}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs",
              "bg-cyan-500/5 border border-cyan-500/15",
              "text-cyan-300/70 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/25",
              "transition-all duration-200"
            )}
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[200px]">{result.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───

interface AIMessageProps {
  message: ChatMessage;
  agentName?: string;
  agentColor?: string;
  onRegenerate?: () => void;
}

export default function AIMessage({
  message,
  agentName,
  agentColor = "#6366f1",
  onRegenerate,
}: AIMessageProps) {
  const isUser = message.role === "user";

  // Build a map of issue keys → full data from tool results (for enriching inline IssueChips)
  const issueDataMap = useMemo(
    () => buildIssueDataMap(message.blocks),
    [message.blocks]
  );

  // Track which tool_result blocks are paired with a tool_start (to avoid rendering them twice)
  const pairedResultIds = useMemo(() => {
    const ids = new Set<string>();
    for (const block of message.blocks) {
      if (block.type === "tool_start" && block.toolUseId) {
        const hasResult = message.blocks.some(
          (b) => b.type === "tool_result" && b.toolUseId === block.toolUseId
        );
        if (hasResult) {
          ids.add(block.toolUseId);
        }
      }
    }
    return ids;
  }, [message.blocks]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 group animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser && "bg-white/[0.02]"
      )}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-3.5 w-3.5 text-white/40" />
        </div>
      ) : (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
          style={{ backgroundColor: agentColor, boxShadow: `0 0 8px ${agentColor}30` }}
        >
          {agentName?.[0] || "C"}
        </div>
      )}

      {/* Content */}
      <div className={cn("flex-1 min-w-0", !isUser && "glass-subtle rounded-xl px-3 py-2")}>
        {/* Name */}
        <span className="text-[10px] font-medium text-white/30 mb-1 block">
          {isUser ? "You" : agentName || "Cleo"}
        </span>

        {/* Message content */}
        <div className="text-sm text-white/80 leading-relaxed">
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.text}</span>
          ) : (
            <>
              {message.blocks.map((block, i) => {
                switch (block.type) {
                  case "text":
                    return (
                      <TextBlock
                        key={i}
                        text={block.text || ""}
                        issueMap={issueDataMap}
                      />
                    );
                  case "tool_start": {
                    // Find matching tool_result and render together as collapsible
                    const matchingResult = message.blocks.find(
                      (b) =>
                        b.type === "tool_result" &&
                        b.toolUseId === block.toolUseId
                    );
                    return (
                      <CollapsibleToolCall
                        key={i}
                        startBlock={block}
                        resultBlock={matchingResult}
                      />
                    );
                  }
                  case "tool_input":
                    // Don't render tool inputs — they're internal details
                    return null;
                  case "tool_result":
                    // Skip if already paired with its tool_start
                    if (block.toolUseId && pairedResultIds.has(block.toolUseId)) {
                      return null;
                    }
                    // Orphaned tool_result (no matching tool_start) — render standalone
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="my-1"
                      >
                        <ToolResultRenderer
                          toolName={block.toolName || "unknown_tool"}
                          content={block.content || ""}
                          isError={block.isError}
                          toolUseId={block.toolUseId}
                        />
                      </motion.div>
                    );
                  case "web_search_results":
                    // Always render web search results (compact link chips)
                    return <WebSearchResultsBlock key={i} block={block} />;
                  default:
                    return null;
                }
              })}
            </>
          )}
        </div>

        {/* Action buttons (hover) */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-6 w-6 text-white/15 hover:text-white/40"
              title="Copy"
            >
              <Copy className="h-3 w-3" />
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerate}
                className="h-6 w-6 text-white/15 hover:text-white/40"
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
