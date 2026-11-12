"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IssueTemplate, TemplateField } from "@/lib/issue-templates";

const FIELD_LABELS: Record<TemplateField, string> = {
  priority: "Priority", dueDate: "Due date", startDate: "Start date", assigneeId: "Assignee", storyPoints: "Story points", labels: "Labels",
};

interface IssueTemplateChecklistProps {
  /** The template of the chosen issue type; nothing is shown without one. */
  template: IssueTemplate | null;
  /** Titles of the required sections that are absent or empty. */
  missingSections: string[];
  /** The required fields that are not set. */
  missingFields: TemplateField[];
  className?: string;
}

/** Lists what the template of the chosen type asks for, and marks what is still missing. It guides; it never blocks. */
export function IssueTemplateChecklist({ template, missingSections, missingFields, className }: IssueTemplateChecklistProps) {
  if (!template || (template.sections.length === 0 && template.requiredFields.length === 0)) return null;
  const missing = missingSections.length + missingFields.length;
  const item = (key: string, label: string, state: "missing" | "done" | "optional", guidance: string) => (
    <li key={key} data-state={state} className="flex items-start gap-1.5">
      {state === "done"
        ? <Check aria-hidden className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" />
        : <Circle aria-hidden className={cn("h-3 w-3 mt-0.5 flex-shrink-0", state === "missing" ? "text-amber-500" : "text-collab-600")} />}
      <span>
        <span className={state === "missing" ? "text-collab-50" : "text-collab-400"}>{label}</span>
        {state === "missing" && <span className="sr-only"> (missing)</span>}
        {state === "optional" && <span className="text-collab-500"> (optional)</span>}
        {guidance && <span className="text-collab-500"> · {guidance}</span>}
      </span>
    </li>
  );
  return (
    <section aria-label="Issue template" className={cn("rounded border border-collab-700 px-3 py-2 text-xs", className)}>
      <p className="mb-1.5 text-collab-400" role="status">
        {missing === 0 ? "Everything the template asks for is there." : `Still missing: ${missing} required ${missing === 1 ? "item" : "items"}. You can create the issue anyway.`}
      </p>
      <ul className="space-y-1">
        {template.sections.map(section => item(
          section.title, section.title,
          !section.required ? "optional" : missingSections.includes(section.title) ? "missing" : "done", section.guidance,
        ))}
        {template.requiredFields.map(field => item(
          field, FIELD_LABELS[field], missingFields.includes(field) ? "missing" : "done", "Set it with the selectors.",
        ))}
      </ul>
    </section>
  );
}
