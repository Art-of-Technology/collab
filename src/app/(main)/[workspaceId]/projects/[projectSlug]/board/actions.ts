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

export async function getExecution(workspaceSlug: string, projectSlug: string, number: number) {
  return (await import('@/lib/forge/execution-service')).loadExecutionView(workspaceSlug, projectSlug, number);
}

export async function markReady(workspaceSlug: string, projectSlug: string, input: unknown) {
  return (await import('@/lib/forge/execution-service')).prepareExecution(workspaceSlug, projectSlug, input);
}

export async function cancelRun(workspaceSlug: string, projectSlug: string, id: string) {
  return (await import('@/lib/forge/execution-service')).cancelExecution(workspaceSlug, projectSlug, id);
}
