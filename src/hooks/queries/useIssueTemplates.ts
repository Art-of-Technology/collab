import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  missingFields, missingSections, nextDescription, storedDescription,
  type IssueTemplate, type TemplateField,
} from '@/lib/issue-templates';

export interface WorkspaceIssueTemplates {
  enforced: boolean;
  canManage: boolean;
  templates: IssueTemplate[];
}

/** The workspace's issue templates, one per templated type. */
export function useIssueTemplates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['issue-templates', workspaceId],
    queryFn: async (): Promise<WorkspaceIssueTemplates> => {
      const response = await fetch(`/api/workspaces/${workspaceId}/issue-templates`);
      if (!response.ok) throw new Error('Failed to fetch issue templates');
      return response.json();
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });
}

/**
 * What a form that creates issues needs from the templates: it keeps the description pre-filled
 * with the chosen type's headings until the person writes something, and reports what the
 * template still requires. A form without templates (still loading, or a Subtask) gets nothing.
 */
export function useIssueTemplateForm(
  workspaceId: string | undefined, type: string, description: string,
  setDescription: (update: (current: string) => string) => void,
  fields: Partial<Record<TemplateField, unknown>>,
) {
  const { data } = useIssueTemplates(workspaceId);
  const templateOf = useCallback((issueType: string) => data?.templates.find(item => item.type === issueType) ?? null, [data]);
  const template = templateOf(type);

  // The template whose headings the form last put in the description.
  const shown = useRef<IssueTemplate | null>(null);
  useEffect(() => {
    const previous = shown.current;
    shown.current = template;
    setDescription(current => nextDescription(current, previous, template));
  }, [template, setDescription]);

  const sections = useMemo(() => (template ? missingSections(template, description) : []), [template, description]);
  const requiredFields = template ? missingFields(template, fields) : [];

  return {
    template,
    missingSections: sections,
    missingFields: requiredFields,
    /** Whether something the template requires is still missing. The form may be submitted anyway. */
    incomplete: sections.length > 0 || requiredFields.length > 0,
    /** The description a cleared form starts from for a type. */
    starting: (issueType: string) => nextDescription('', null, templateOf(issueType)),
    /** The description to store: nothing when only the pre-filled headings are there. */
    stored: (text: string) => storedDescription(text, template),
  };
}
