'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { TEMPLATE_FIELDS, templateBody, type IssueTemplate, type TemplateField, type TemplateSection } from '@/lib/issue-templates';

const TYPE_LABELS: Record<IssueTemplate['type'], string> = { BUG: 'Bug', STORY: 'Story', EPIC: 'Epic', MILESTONE: 'Milestone', TASK: 'Task' };
const FIELD_LABELS: Record<TemplateField, string> = {
  priority: 'Priority', dueDate: 'Due date', startDate: 'Start date', assigneeId: 'Assignee', storyPoints: 'Story points', labels: 'Labels',
};

interface IssueTemplatesSettingsProps {
  workspaceId: string;
  initialTemplates: IssueTemplate[];
  initialEnforced: boolean;
}

export default function IssueTemplatesSettings({ workspaceId, initialTemplates, initialEnforced }: IssueTemplatesSettingsProps) {
  // What is stored, and the unsaved edits of each type.
  const [saved, setSaved] = useState(initialTemplates);
  const [drafts, setDrafts] = useState(initialTemplates);
  const [enforced, setEnforced] = useState(initialEnforced);
  const [busy, setBusy] = useState<IssueTemplate['type'] | 'enforced' | null>(null);

  const edit = (type: IssueTemplate['type'], change: (draft: IssueTemplate) => IssueTemplate) =>
    setDrafts(current => current.map(draft => (draft.type === type ? change(draft) : draft)));
  const editSections = (type: IssueTemplate['type'], change: (sections: TemplateSection[]) => TemplateSection[]) =>
    edit(type, draft => ({ ...draft, sections: change(draft.sections) }));

  // One change at a time: sends it, shows the outcome, and hands the server's answer to `apply`.
  async function put(working: NonNullable<typeof busy>, body: object, done: string, apply: (result: { template: IssueTemplate & { body?: string } }) => void) {
    setBusy(working);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/issue-templates`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The change could not be saved.');
      apply(result);
      toast({ title: done });
    } catch (error) {
      toast({ title: 'Not saved', description: error instanceof Error ? error.message : 'The change could not be saved.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const send = (type: IssueTemplate['type'], body: object, done: string) => put(type, { type, ...body }, done, result => {
    const { body: _markdown, ...template } = result.template;
    setSaved(current => current.map(item => (item.type === type ? template : item)));
    setDrafts(current => current.map(item => (item.type === type ? template : item)));
  });

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base"><Label htmlFor="enforce-issue-templates" className="text-base">Require templates for agents</Label></CardTitle>
          <CardDescription>
            When this is on, an agent that creates or edits an issue without a required section or field is refused and told what is missing.
            People in the web app are never refused. Agents on a Collab CLI older than 0.9.0 get a refusal with no explanation, so update them first.
          </CardDescription>
        </div>
        <Switch
          id="enforce-issue-templates" checked={enforced} disabled={busy !== null}
          onCheckedChange={next => put('enforced', { enforced: next }, next ? 'Agents must now follow the templates' : 'Agents are no longer held to the templates', () => setEnforced(next))}
        />
      </CardHeader>
    </Card>

    <Tabs defaultValue={drafts[0]?.type}>
      <TabsList>
        {drafts.map(draft => <TabsTrigger key={draft.type} value={draft.type}>{TYPE_LABELS[draft.type]}</TabsTrigger>)}
      </TabsList>

      {drafts.map(draft => {
        const stored = saved.find(item => item.type === draft.type);
        const changed = JSON.stringify(stored) !== JSON.stringify(draft);
        const working = busy === draft.type;
        return (
          <TabsContent key={draft.type} value={draft.type} className="space-y-4">
            <fieldset disabled={busy !== null} className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {TYPE_LABELS[draft.type]} template
                  <Badge variant="outline">{stored?.standard ? 'Standard' : `Edited, version ${stored?.version}`}</Badge>
                </CardTitle>
                <CardDescription>Each section is a heading in the issue description. Required sections must have something under them.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft.sections.map((section, index) => (
                  <div key={index} className="border border-border/40 rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Title of section ${index + 1}`} value={section.title} maxLength={80} placeholder="Section title"
                        onChange={event => editSections(draft.type, sections => sections.map((item, at) => (at === index ? { ...item, title: event.target.value } : item)))}
                      />
                      <Label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <Switch
                          checked={section.required}
                          onCheckedChange={required => editSections(draft.type, sections => sections.map((item, at) => (at === index ? { ...item, required } : item)))}
                        />
                        Required
                      </Label>
                      <Button
                        variant="ghost" size="icon" aria-label={`Move section ${index + 1} up`} disabled={index === 0}
                        onClick={() => editSections(draft.type, sections => sections.map((item, at) => (at === index - 1 ? sections[index] : at === index ? sections[index - 1] : item)))}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" aria-label={`Move section ${index + 1} down`} disabled={index === draft.sections.length - 1}
                        onClick={() => editSections(draft.type, sections => sections.map((item, at) => (at === index + 1 ? sections[index] : at === index ? sections[index + 1] : item)))}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" aria-label={`Remove section ${index + 1}`}
                        onClick={() => editSections(draft.type, sections => sections.filter((_, at) => at !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      aria-label={`Guidance for section ${index + 1}`} value={section.guidance} maxLength={500} rows={2}
                      placeholder="What should the writer put here?"
                      onChange={event => editSections(draft.type, sections => sections.map((item, at) => (at === index ? { ...item, guidance: event.target.value } : item)))}
                    />
                  </div>
                ))}
                <Button
                  variant="outline" size="sm" disabled={draft.sections.length >= 20}
                  onClick={() => editSections(draft.type, sections => [...sections, { title: '', required: true, guidance: '' }])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add section
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Required fields</CardTitle>
                <CardDescription>Issue fields that must be set, besides the description.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                {TEMPLATE_FIELDS.map(field => (
                  <Label key={field} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={draft.requiredFields.includes(field)}
                      onCheckedChange={checked => edit(draft.type, current => ({
                        ...current, requiredFields: TEMPLATE_FIELDS.filter(item => (item === field ? checked === true : current.requiredFields.includes(item))),
                      }))}
                    />
                    {FIELD_LABELS[field]}
                  </Label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">What agents receive</CardTitle>
                <CardDescription>The description an agent starts from. The text in comments is guidance and is not shown in the issue.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3">{templateBody(draft, 'markdown') || 'This type has no sections.'}</pre>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2">
              <Button disabled={!changed || working} onClick={() => send(draft.type, { sections: draft.sections, requiredFields: draft.requiredFields }, `${TYPE_LABELS[draft.type]} template saved`)}>
                {working && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save
              </Button>
              <Button variant="outline" disabled={!changed || working} onClick={() => stored && edit(draft.type, () => stored)}>
                Discard changes
              </Button>
              <Button
                variant="ghost" disabled={stored?.standard || working}
                onClick={() => send(draft.type, { reset: true }, `${TYPE_LABELS[draft.type]} template reset to the standard`)}
              >
                Reset to standard
              </Button>
            </div>
            </fieldset>
          </TabsContent>
        );
      })}
    </Tabs>
    </div>
  );
}
