import { notFound } from 'next/navigation';
import { loadProjectMemory } from '@/lib/forge/memory-service';
import { ProjectMemoryEditor } from '@/components/notes/ProjectMemoryEditor';

export default async function ProjectMemoryPage({ params }: {
  params: Promise<{ workspaceId: string; projectSlug: string }>;
}) {
  const { workspaceId, projectSlug } = await params;
  const initial = await loadProjectMemory(workspaceId, projectSlug);
  if (initial.kind === 'denied') notFound();
  return <ProjectMemoryEditor initial={initial} workspace={workspaceId} project={projectSlug} />;
}
