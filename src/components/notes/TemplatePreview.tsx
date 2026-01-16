"use client";

import { useMemo } from "react";
import { NoteType } from "@prisma/client";
import { NOTE_TYPE_CONFIGS } from "@/lib/note-types";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";
import { LucideIcon, Clock, User } from "lucide-react";
import { TemplateData } from "./TemplateCard";
import { previewTemplateWithPlaceholders, extractPlaceholders } from "@/lib/template-placeholders";

interface TemplatePreviewProps {
  template: TemplateData;
  className?: string;
}

function getIconComponent(iconName: string | null): LucideIcon {
  if (!iconName) return LucideIcons.FileText;
  const icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
  return icon || LucideIcons.FileText;
}

export function TemplatePreview({ template, className }: TemplatePreviewProps) {
  const Icon = getIconComponent(template.icon);
  const typeConfig = NOTE_TYPE_CONFIGS[template.defaultType];

  // Get placeholders used in this template
  const placeholders = useMemo(() => {
    return extractPlaceholders(template.titleTemplate + template.contentTemplate);
  }, [template.titleTemplate, template.contentTemplate]);

  // Preview the title with placeholder styling
  const previewTitle = useMemo(() => {
    return previewTemplateWithPlaceholders(template.titleTemplate);
  }, [template.titleTemplate]);

  // Preview content with placeholder styling (truncated)
  const previewContent = useMemo(() => {
    const styled = previewTemplateWithPlaceholders(template.contentTemplate);
    // Truncate for preview
    return styled.slice(0, 800) + (template.contentTemplate.length > 800 ? "..." : "");
  }, [template.contentTemplate]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-[#1f1f1f] bg-[#0a0a0b]">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
              typeConfig.bgColor
            )}
          >
            <Icon className={cn("h-5 w-5", typeConfig.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-[#fafafa] mb-1">
              {template.name}
            </h3>
            {template.description && (
              <p className="text-[12px] text-[#6e7681]">{template.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex-none px-4 py-2 border-b border-[#1f1f1f] flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[11px] text-[#6e7681]">
          <span
            className={cn(
              "px-2 py-0.5 rounded font-medium",
              typeConfig.bgColor,
              typeConfig.color
            )}
          >
            {typeConfig.label}
          </span>
        </div>

        {template.author && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#6e7681]">
            <User className="h-3 w-3" />
            <span>By {template.author.name || "Unknown"}</span>
          </div>
        )}

        {template.usageCount > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#6e7681]">
            <Clock className="h-3 w-3" />
            <span>Used {template.usageCount} times</span>
          </div>
        )}
      </div>

      {/* Placeholders Info */}
      {placeholders.length > 0 && (
        <div className="flex-none px-4 py-2 border-b border-[#1f1f1f] bg-[#0a0a0b]">
          <p className="text-[10px] uppercase font-semibold text-[#52525b] mb-1.5">
            Dynamic Fields
          </p>
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((p) => (
              <span
                key={p}
                className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary font-mono"
              >
                {`{{${p}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content Preview */}
      <div className="flex-1 overflow-auto p-4">
        {/* Title Preview */}
        <div className="mb-4">
          <p className="text-[10px] uppercase font-semibold text-[#52525b] mb-1.5">
            Title Template
          </p>
          <div
            className="text-[15px] font-semibold text-[#e6edf3]"
            dangerouslySetInnerHTML={{ __html: previewTitle }}
          />
        </div>

        {/* Content Preview */}
        <div>
          <p className="text-[10px] uppercase font-semibold text-[#52525b] mb-1.5">
            Content Preview
          </p>
          <div
            className="prose prose-sm prose-invert max-w-none text-[13px] text-[#8b949e] [&_h2]:text-[14px] [&_h2]:text-[#e6edf3] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-[13px] [&_h3]:text-[#c9d1d9] [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_code]:bg-[#1f1f1f] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px] [&_pre]:bg-[#0a0a0b] [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-[11px] [&_table]:border-collapse [&_th]:border [&_th]:border-[#1f1f1f] [&_th]:px-2 [&_th]:py-1 [&_th]:text-[11px] [&_th]:bg-[#0a0a0b] [&_td]:border [&_td]:border-[#1f1f1f] [&_td]:px-2 [&_td]:py-1 [&_td]:text-[11px]"
            dangerouslySetInnerHTML={{ __html: previewContent }}
          />
        </div>
      </div>

      {/* Tags */}
      {template.defaultTags.length > 0 && (
        <div className="flex-none px-4 py-2 border-t border-[#1f1f1f] bg-[#0a0a0b]">
          <p className="text-[10px] uppercase font-semibold text-[#52525b] mb-1.5">
            Default Tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {template.defaultTags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-0.5 rounded bg-[#1f1f1f] text-[#8b949e]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
