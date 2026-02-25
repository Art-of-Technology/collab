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
          ? "bg-collab-800 border-blue-500/50 ring-1 ring-blue-500/20"
          : "bg-collab-900 border-collab-700 hover:bg-collab-800 hover:border-collab-600"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
          isSelected ? "bg-blue-500/10" : "bg-collab-800 group-hover:bg-collab-700"
        )}
      >
        <Icon
          className={cn(
            "h-4.5 w-4.5 transition-colors",
            isSelected ? "text-blue-500" : typeConfig.color
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h3
            className={cn(
              "text-[13px] font-medium truncate transition-colors",
              isSelected ? "text-blue-500" : "text-collab-50 group-hover:text-white"
            )}
          >
            {template.name}
          </h3>
          {template.isBuiltIn && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[9px] font-medium">
              <Sparkles className="h-2 w-2" />
              Built-in
            </span>
          )}
        </div>

        {template.description && (
          <p className="text-[11px] text-collab-500 line-clamp-2 mb-1.5">
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
              className="text-[10px] px-1.5 py-0.5 rounded bg-collab-700 text-collab-400"
            >
              {tag}
            </span>
          ))}
          {template.defaultTags.length > 2 && (
            <span className="text-[10px] text-collab-500">
              +{template.defaultTags.length - 2}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
