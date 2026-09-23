'use server';

import { loadForgeBoard } from '@/lib/forge/board';

export async function refreshForgeBoard(workspaceSlug: string, projectSlug: string) {
  return loadForgeBoard(workspaceSlug, projectSlug);
}
