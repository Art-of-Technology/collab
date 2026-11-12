// Issue templates: one standard description per issue type, as headed sections plus the issue fields
// that must be set. This file is pure: the server and the web forms both use it, so they agree on
// what is missing.
import { commentHtml } from '@/lib/comment-html';

export type TemplatedIssueType = 'BUG' | 'STORY' | 'EPIC' | 'MILESTONE' | 'TASK';
export type TemplateField = 'priority' | 'dueDate' | 'startDate' | 'assigneeId' | 'storyPoints' | 'labels';

export interface TemplateSection {
  title: string;
  required: boolean;
  /** One or two sentences telling the writer what goes in the section. */
  guidance: string;
}

export interface IssueTemplate {
  type: TemplatedIssueType;
  version: number;
  /** True for the built-in standard, false once a workspace has edited the type. */
  standard: boolean;
  sections: TemplateSection[];
  requiredFields: TemplateField[];
}

/** Subtasks are deliberately absent: they stay free-form. */
export const TEMPLATED_TYPES: TemplatedIssueType[] = ['BUG', 'STORY', 'EPIC', 'MILESTONE', 'TASK'];
export const TEMPLATE_FIELDS: TemplateField[] = ['priority', 'dueDate', 'startDate', 'assigneeId', 'storyPoints', 'labels'];

const must = (title: string, guidance: string): TemplateSection => ({ title, required: true, guidance });
const may = (title: string, guidance: string): TemplateSection => ({ title, required: false, guidance });
const standard = (type: TemplatedIssueType, sections: TemplateSection[], requiredFields: TemplateField[] = []): IssueTemplate =>
  ({ type, version: 1, standard: true, sections, requiredFields });

export const STANDARD_TEMPLATES: Record<TemplatedIssueType, IssueTemplate> = {
  BUG: standard('BUG', [
    must('Summary', 'What is wrong, in one or two sentences.'),
    must('Steps to reproduce', 'Numbered steps from a known starting point.'),
    must('Expected result', 'What should have happened.'),
    must('Actual result', 'What happened instead, with the exact error text if there is one.'),
    must('Environment', 'Where it happens: app version or commit, browser or operating system, account or workspace, data involved.'),
    must('Severity and impact', 'Who is affected and how badly. Say if data is lost or security is involved.'),
    may('Evidence', 'Logs, screenshots, links.'),
    may('Workaround', 'What people can do until it is fixed.'),
  ], ['priority']),
  STORY: standard('STORY', [
    must('User story', 'As a ..., I want ..., so that ...'),
    must('Actors', 'Who or what takes part.'),
    must('Preconditions', 'What must be true before it starts.'),
    must('Main flow', 'Numbered steps of the normal path.'),
    may('Alternate flows', 'Variations and failures, by step.'),
    must('Acceptance criteria', 'Statements that can be checked, for example Given / When / Then.'),
    may('Out of scope', 'What this story deliberately leaves out.'),
  ]),
  EPIC: standard('EPIC', [
    must('Goal', 'The outcome, not the work.'),
    must('Background', 'The problem and who has it.'),
    must('Scope', 'What is included.'),
    must('Non-goals', 'What is deliberately left out.'),
    must('Success measures', 'How we will know it worked.'),
    must('Deliverables', 'The stories or tasks expected.'),
    may('Dependencies and risks', 'What this waits on and what could go wrong.'),
  ]),
  MILESTONE: standard('MILESTONE', [
    must('Goal', 'What reaching this milestone means.'),
    must('Deliverables', 'What must be finished.'),
    must('Exit criteria', 'What must be true to call it reached.'),
    must('Target date', 'The date, and what it depends on.'),
    may('Dependencies and risks', 'What this waits on and what could go wrong.'),
  ], ['dueDate']),
  TASK: standard('TASK', [
    must('What', 'The change or action.'),
    must('Why', 'The reason, or the issue it serves.'),
    must('Done when', 'How to tell it is finished.'),
    may('Notes', 'Anything else worth knowing.'),
  ]),
};

/** The template for an issue type, or null for Subtask and for types that have none. */
export function templateFor(templates: Record<TemplatedIssueType, IssueTemplate>, type: string): IssueTemplate | null {
  const key = type.toUpperCase() as TemplatedIssueType;
  return TEMPLATED_TYPES.includes(key) ? templates[key] : null;
}

// Extract comparison text, not HTML for rendering.
const plainText = (text: string) => text.split(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g).join('');
const escapeHeading = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Heading text as it is compared: no markup, lower case, single spaces, no punctuation at the ends.
const comparable = (text: string) => plainText(text).replace(/&nbsp;/gi, ' ').toLowerCase()
  .replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * The required sections that a description lacks or leaves empty, in template order. A section is
 * a heading; it is filled when something visible follows it before the next heading. Descriptions
 * are stored as Markdown or as editor HTML, so the check reads them the way they are displayed.
 */
export function missingSections(template: IssueTemplate, description: string | null | undefined): string[] {
  const filled = new Set<string>();
  const parts = headingParts(description);
  for (let index = 1; index < parts.length; index += 2) {
    if (visible(parts[index + 1])) filled.add(comparable(parts[index]));
  }
  return template.sections.filter(section => section.required && !filled.has(comparable(escapeHeading(section.title)))).map(section => section.title);
}

// A description as it is displayed, split at its headings: text before the first, then heading, content, heading, content, ...
const headingParts = (description: string | null | undefined) =>
  (description ? commentHtml(description, null, true) : '').split(/<h[1-4]\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/h[1-4]>/i);
// Whether a piece of displayed HTML shows anything: an image or some text.
const visible = (html: string) => /<img\b/i.test(html)
  || plainText(html).replace(/&nbsp;/gi, ' ').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim() !== '';

// Whether a description is exactly a template's headings, in order, with nothing written under them.
function untouched(description: string, template: IssueTemplate | null): boolean {
  if (!template) return false;
  const parts = headingParts(description);
  const headings = parts.filter((_, index) => index % 2 === 1).map(comparable);
  return !parts.some((part, index) => index % 2 === 0 && visible(part))
    && headings.length === template.sections.length
    && template.sections.every((section, index) => headings[index] === comparable(escapeHeading(section.title)));
}

/**
 * The description a web form shows after the issue type is chosen or changed: the new type's
 * headings when nothing has been written yet, otherwise what the person wrote. `previous` is the
 * template whose headings the form put there before.
 */
export function nextDescription(current: string, previous: IssueTemplate | null, next: IssueTemplate | null): string {
  const parts = headingParts(current);
  const empty = parts.length === 1 && !visible(parts[0]);
  return empty || untouched(current, previous) ? (next ? templateBody(next, 'html') : '') : current;
}

/** What a web form stores: nothing when the description is still only the headings it was given. */
export function storedDescription(current: string, template: IssueTemplate | null): string {
  return untouched(current, template) ? '' : current;
}

/** The required fields that have no value. An empty text or an empty list is no value. */
export function missingFields(template: IssueTemplate, values: Partial<Record<TemplateField, unknown>>): TemplateField[] {
  return template.requiredFields.filter(field => {
    const value = values[field];
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  });
}

/**
 * A description to start from. As HTML, for the web editor, it is the headings alone, so nothing
 * but the writer's own words is ever stored. As Markdown, for agents, each heading carries its
 * guidance in a comment, which is not displayed and does not count as content.
 */
export function templateBody(template: IssueTemplate, format: 'html' | 'markdown'): string {
  if (format === 'html') {
    return template.sections.map(section => `<h2>${escapeHeading(section.title)}</h2>`).join('');
  }
  return template.sections.map(section =>
    `## ${section.title.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~\r\n]/g, char => `&#${char.charCodeAt(0)};`)}\n\n<!-- ${section.guidance.replace(/-(?=-)/g, '- ')}${section.required ? '' : ' (optional)'} -->\n`).join('\n');
}

/**
 * Checks and tidies a template that a workspace admin wants to save. A type may have no sections
 * at all, which leaves it without a template.
 */
export function validateTemplateInput(input: unknown): { sections: TemplateSection[]; requiredFields: TemplateField[] } | { error: string } {
  const { sections, requiredFields } = (input ?? {}) as { sections?: unknown; requiredFields?: unknown };
  if (!Array.isArray(sections)) return { error: 'The sections of a template must be a list.' };
  if (sections.length > 20) return { error: 'A template has at most 20 sections.' };
  const titles = new Set<string>();
  const tidy: TemplateSection[] = [];
  for (const section of sections as Array<Partial<Record<keyof TemplateSection, unknown>> | null>) {
    const title = typeof section?.title === 'string' ? section.title.trim() : '';
    if (typeof section?.required !== 'boolean' || typeof section?.guidance !== 'string') return { error: 'Every section needs a required flag and guidance text.' };
    const guidance = section.guidance.trim();
    // A title is matched against headings by its letters and digits, so it needs some.
    if (!comparable(title) || title.length > 80) return { error: 'Every section needs a title of 1 to 80 characters with letters or digits in it.' };
    if (guidance.length > 500) return { error: `The guidance for "${title}" is longer than 500 characters.` };
    if (titles.has(comparable(title))) return { error: `The section title "${title}" is used more than once.` };
    titles.add(comparable(title));
    tidy.push({ title, required: section.required, guidance });
  }
  if (!Array.isArray(requiredFields) || requiredFields.some(field => !TEMPLATE_FIELDS.includes(field as TemplateField))) {
    return { error: `Required fields must be chosen from: ${TEMPLATE_FIELDS.join(', ')}.` };
  }
  return { sections: tidy, requiredFields: TEMPLATE_FIELDS.filter(field => requiredFields.includes(field)) };
}

/** A template as the read routes return it: with a Markdown body ready to fill in. */
export const withBody = (template: IssueTemplate) => ({ ...template, body: templateBody(template, 'markdown') });
