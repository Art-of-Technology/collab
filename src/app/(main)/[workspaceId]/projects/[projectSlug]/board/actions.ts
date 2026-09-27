'use server';

import { loadForgeBoard } from '@/lib/forge/board';
import { changeForgeIssue, loadForgeIssue } from '@/lib/forge/issue-service';

export async function getIssue(workspaceSlug: string, projectSlug: string, number: number) {
  return loadForgeIssue(workspaceSlug, projectSlug, number);
}

export async function changeIssue(workspaceSlug: string, projectSlug: string, input: unknown) {
  return changeForgeIssue(workspaceSlug, projectSlug, input);
}

export async function refreshForgeBoard(workspaceSlug: string, projectSlug: string) {
  return loadForgeBoard(workspaceSlug, projectSlug);
}
