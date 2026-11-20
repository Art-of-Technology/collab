"use client";

import { useQuery } from '@tanstack/react-query';
import { issueKeys } from '@/hooks/queries/useIssues';

type Milestone = { id: string; issueKey: string | null; title: string };

export function IssueMilestoneSelector({ projectId, issueId, value, onChange, disabled }: {
  projectId: string;
  issueId: string;
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const { data, isError } = useQuery({
    queryKey: [...issueKeys.byProject(projectId), 'milestones'],
    queryFn: async (): Promise<Milestone[]> => {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/milestones`);
      if (!response.ok) throw new Error('Could not load milestones');
      return (await response.json()).milestones;
    },
  });

  const options = data?.filter(milestone => milestone.id !== issueId) ?? [];
  return (
    <select
      aria-label="Milestone"
      className="w-full rounded-md border border-collab-700 bg-collab-900 px-2 py-1.5 text-sm text-collab-200"
      value={value ?? ''}
      disabled={disabled || (!data && !value)}
      onChange={event => onChange(event.target.value || null)}
    >
      <option value="">{isError ? 'Could not load milestones' : data ? 'No milestone' : 'Loading milestones…'}</option>
      {value && !options.some(milestone => milestone.id === value) && (
        <option value={value}>{data || isError ? 'Unavailable milestone' : 'Loading milestone…'}</option>
      )}
      {options.map(milestone => (
        <option key={milestone.id} value={milestone.id}>
          {[milestone.issueKey, milestone.title].filter(Boolean).join(' · ')}
        </option>
      ))}
    </select>
  );
}
