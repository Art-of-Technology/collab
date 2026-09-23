'use server';
import { changeProjectMemory, loadProjectMemory } from '@/lib/forge/memory-service';

export async function refreshProjectMemory(workspace: string, project: string) {
  return loadProjectMemory(workspace, project);
}
export async function updateProjectMemory(workspace: string, project: string, command: unknown) {
  return changeProjectMemory(workspace, project, command);
}
