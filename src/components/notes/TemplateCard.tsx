"use client";

import { NoteType, NoteScope } from "@prisma/client";
import { NOTE_TYPE_CONFIGS, NOTE_SCOPE_CONFIGS } from "@/lib/note-types";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";
import { LucideIcon, Sparkles } from "lucide-react";

export interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  titleTemplate: string;
  contentTemplate: string;
  defaultType: NoteType;
  defaultScope: NoteScope;
  defaultTags: string[];
  isBuiltIn: boolean;
  usageCount: number;
  order: number;
  author?: { id: string; name: string | null; image: string | null } | null;
}

interface TemplateCardProps {
  template: TemplateData;
  onClick: (template: TemplateData) => void;
  isSelected?: boolean;
  showPreview?: boolean;
}

function getIconComponent(iconName: string | null): LucideIcon {
  if (!iconName) return LucideIcons.FileText;
  const icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
  return icon || LucideIcons.FileText;
}

export function TemplateCard({
  template,
  onClick,
  isSelected = false,
  showPreview = false,
}: TemplateCardProps) {
  const Icon = getIconComponent(template.icon);
  const typeConfig = NOTE_TYPE_CONFIGS[template.defaultType];

  return (
    <button
      onClick={() => onClick(template)}
      className={cn(
        "group w-full flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 text-left",
        isSelected
          ? "bg-[#1a1a1b] border-[#3b82f6]/50 ring-1 ring-[#3b82f6]/20"
          : "bg-[#0d0d0e] border-[#1f1f1f] hover:bg-[#151518] hover:border-[#2a2a2d]"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
          isSelected ? "bg-[#3b82f6]/10" : "bg-[#1a1a1b] group-hover:bg-[#1f1f1f]"
        )}
      >
        <Icon
          className={cn(
            "h-4.5 w-4.5 transition-colors",
            isSelected ? "text-[#3b82f6]" : typeConfig.color
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3
            className={cn(
              "text-[13px] font-medium truncate transition-colors",
              isSelected ? "text-[#3b82f6]" : "text-[#fafafa] group-hover:text-white"
            )}
          >
            {template.name}
          </h3>
          {template.isBuiltIn && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#3b82f6]/10 text-[#3b82f6] text-[9px] font-medium">
              <Sparkles className="h-2 w-2" />
              Built-in
            </span>
          )}
        </div>

        {template.description && (
          <p className="text-[11px] text-[#6e7681] line-clamp-2 mb-1.5">
            {template.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium",
              typeConfig.bgColor,
              typeConfig.color
            )}
          >
            {typeConfig.label}
          </span>
          {template.defaultTags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#8b949e]"
            >
              {tag}
            </span>
          ))}
          {template.defaultTags.length > 2 && (
            <span className="text-[10px] text-[#6e7681]">
              +{template.defaultTags.length - 2}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
