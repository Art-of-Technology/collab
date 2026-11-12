// Holding agents to the issue templates. Only the agent-facing routes call this: a person in the
// web app is guided by the same templates but never refused.
import {
  TEMPLATE_FIELDS, missingFields, missingSections, templateFor,
  type IssueTemplate, type TemplateField, type TemplateSection, type TemplatedIssueType,
} from '@/lib/issue-templates';

/** What the checks look at: an issue as it is, or as it would be after a change. */
export interface IssueShape {
  type: string;
  description: string | null;
  fields: Partial<Record<TemplateField, unknown>>;
}

/** The body of the HTTP 422 answer. Nothing is written when one is returned. */
export interface TemplateRefusal {
  error: 'template_required';
  error_description: string;
  issue_type: string;
  template_version: number;
  missing_sections: string[];
  missing_fields: TemplateField[];
  template: { sections: TemplateSection[]; requiredFields: TemplateField[] };
}

/** Carries a refusal out of a database transaction, which rolls back. */
export class TemplateRefused extends Error {
  constructor(public refusal: TemplateRefusal) { super('template_required'); }
}

/** The columns `issueShape` needs when it reads a stored issue. */
export const ISSUE_SHAPE_SELECT = {
  type: true, description: true, priority: true, dueDate: true, startDate: true,
  assigneeId: true, storyPoints: true, labels: { select: { id: true } },
} as const;

/** An issue row, or a row with a request's changes laid over it, as the checks read it. */
export function issueShape(row: { type?: unknown; description?: unknown } & Partial<Record<TemplateField, unknown>>): IssueShape {
  return {
    type: String(row.type),
    description: typeof row.description === 'string' ? row.description : null,
    fields: Object.fromEntries(TEMPLATE_FIELDS.map(field => [field, row[field]])),
  };
}

/** Why a new issue is refused, or null when it has all its template requires or its type has no template. */
export function createRefusal(templates: Record<TemplatedIssueType, IssueTemplate>, issue: IssueShape): TemplateRefusal | null {
  const template = templateFor(templates, issue.type);
  if (!template) return null;
  const sections = missingSections(template, issue.description);
  const fields = missingFields(template, issue.fields);
  if (!sections.length && !fields.length) return null;
  return {
    error: 'template_required',
    error_description: [
      sections.length && `Missing required sections: ${sections.join(', ')}.`,
      fields.length && `Missing required fields: ${fields.join(', ')}.`,
      sections.length && 'Write each section as a heading.',
      `Get the template with "collab templates get ${template.type}".`,
    ].filter(Boolean).join(' '),
    issue_type: template.type,
    template_version: template.version,
    missing_sections: sections,
    missing_fields: fields,
    template: { sections: template.sections, requiredFields: template.requiredFields },
  };
}

/**
 * Why a change is refused. An issue that was already incomplete may be edited freely, so agents can
 * still work on older issues; one that was complete, or exempt, must end complete or exempt.
 */
export function updateRefusal(templates: Record<TemplatedIssueType, IssueTemplate>, before: IssueShape, after: IssueShape): TemplateRefusal | null {
  return createRefusal(templates, before) ? null : createRefusal(templates, after);
}
