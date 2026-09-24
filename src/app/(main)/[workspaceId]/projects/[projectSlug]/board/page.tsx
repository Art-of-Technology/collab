import { notFound } from 'next/navigation';
import { loadForgeBoard } from '@/lib/forge/board';
import { ForgeBoardView } from './ForgeBoardView';

export default async function ProjectBoardPage({ params }: {
  params: Promise<{ workspaceId: string; projectSlug: string }>;
}) {
  const { workspaceId, projectSlug } = await params;
  const board = await loadForgeBoard(workspaceId, projectSlug);
  if (board.kind === 'denied') notFound();
  return <ForgeBoardView initial={board} workspaceSlug={workspaceId} projectSlug={projectSlug} />;
}
