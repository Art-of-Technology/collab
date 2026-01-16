"use client";

import { useState, useMemo } from "react";
import { NoteType, NoteScope } from "@prisma/client";
import { NOTE_TYPE_CATEGORIES } from "@/lib/note-types";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateCard, TemplateData } from "./TemplateCard";
import { Search, FileText, Sparkles, Loader2 } from "lucide-react";
import { extractPlaceholders } from "@/lib/template-placeholders";

interface TemplatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId?: string | null;
  onSelectTemplate: (template: TemplateData, title?: string) => void;
  onStartBlank: () => void;
}

type TemplateFilter = "all" | "builtin" | "custom";

export function TemplatePickerDialog({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  onSelectTemplate,
  onStartBlank,
}: TemplatePickerDialogProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateData | null>(null);
  const [customTitle, setCustomTitle] = useState("");

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["note-templates", workspaceId],
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId });
      const res = await fetch(`/api/notes/templates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: open,
  });

  const templates: TemplateData[] = templatesData?.templates || [];

  // Filter and search templates
  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Apply filter
    if (filter === "builtin") {
      result = result.filter((t) => t.isBuiltIn);
    } else if (filter === "custom") {
      result = result.filter((t) => !t.isBuiltIn);
    }

    // Apply search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower) ||
          t.defaultTags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    return result;
  }, [templates, filter, search]);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, TemplateData[]> = {};

    for (const template of filteredTemplates) {
      const category = NOTE_TYPE_CATEGORIES.find((c) =>
        c.types.includes(template.defaultType)
      );
      const categoryId = category?.id || "other";

      if (!groups[categoryId]) {
        groups[categoryId] = [];
      }
      groups[categoryId].push(template);
    }

    return groups;
  }, [filteredTemplates]);

  // Check if selected template needs title input
  const needsTitleInput = useMemo(() => {
    if (!selectedTemplate) return false;
    const placeholders = extractPlaceholders(
      selectedTemplate.titleTemplate + selectedTemplate.contentTemplate
    );
    return placeholders.includes("title");
  }, [selectedTemplate]);

  const handleSelectTemplate = (template: TemplateData) => {
    setSelectedTemplate(template);
    setCustomTitle("");
  };

  const handleConfirm = () => {
    if (!selectedTemplate) return;
    onSelectTemplate(selectedTemplate, needsTitleInput ? customTitle : undefined);
    handleClose();
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setCustomTitle("");
    setSearch("");
    onOpenChange(false);
  };

  const handleStartBlank = () => {
    onStartBlank();
    handleClose();
  };

  const customTemplatesCount = templates.filter((t) => !t.isBuiltIn).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0 bg-[#0d0d0e] border-[#1f1f1f]">
        {/* Header */}
        <DialogHeader className="flex-none px-5 py-4 border-b border-[#1f1f1f]">
          <DialogTitle className="text-[15px] font-semibold text-[#fafafa]">
            Choose a Template
          </DialogTitle>
          <p className="text-[12px] text-[#6e7681] mt-1">
            Start with a template or create a blank note
          </p>
        </DialogHeader>

        {/* Search and Filter */}
        <div className="flex-none px-5 py-3 border-b border-[#1f1f1f] space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="pl-9 h-9 text-[13px] bg-[#0a0a0b] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b] focus:border-[#30363d]"
            />
          </div>

          {/* Filter Tabs */}
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as TemplateFilter)}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-3 h-8 bg-[#0a0a0b] border border-[#1f1f1f] p-0.5">
              <TabsTrigger
                value="all"
                className="text-[12px] h-full data-[state=active]:bg-[#1f1f1f] data-[state=active]:text-[#fafafa]"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="builtin"
                className="text-[12px] h-full data-[state=active]:bg-[#1f1f1f] data-[state=active]:text-[#fafafa]"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Built-in
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="text-[12px] h-full data-[state=active]:bg-[#1f1f1f] data-[state=active]:text-[#fafafa]"
              >
                Custom ({customTemplatesCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 text-[#6e7681] animate-spin" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-8 w-8 text-[#3f3f46] mb-3" />
              <p className="text-[13px] text-[#6e7681] mb-1">No templates found</p>
              <p className="text-[11px] text-[#52525b]">
                {search ? "Try a different search term" : "No templates available"}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {NOTE_TYPE_CATEGORIES.filter((c) => groupedTemplates[c.id]).map(
                (category) => (
                  <div key={category.id}>
                    {/* Category Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
                        {category.label}
                      </h3>
                      <div className="flex-1 h-px bg-[#1f1f1f]" />
                    </div>

                    {/* Templates Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {groupedTemplates[category.id].map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onClick={handleSelectTemplate}
                          isSelected={selectedTemplate?.id === template.id}
                        />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Title Input (if template needs it) */}
        {selectedTemplate && needsTitleInput && (
          <div className="flex-none px-5 py-3 border-t border-[#1f1f1f] bg-[#0a0a0b]">
            <label className="text-[11px] font-medium text-[#8b949e] mb-1.5 block">
              Title for your note
            </label>
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Enter a title..."
              className="h-9 text-[13px] bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b] focus:border-[#30363d]"
              autoFocus
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex-none px-5 py-3 border-t border-[#1f1f1f] flex items-center justify-between bg-[#0a0a0b]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartBlank}
            className="text-[12px] h-8 text-[#6e7681] hover:text-[#e6edf3]"
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Start blank
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-[12px] h-8 text-[#6e7681] hover:text-[#e6edf3]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!selectedTemplate || (needsTitleInput && !customTitle.trim())}
              className="text-[12px] h-8 bg-[#3b82f6] hover:bg-[#2563eb] text-white"
            >
              Use Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
