import { notFound } from 'next/navigation';
import { loadForgeBoard } from '@/lib/forge/board';
import { ForgeBoardView } from './ForgeBoardView';
import { loadForgeIssueRights } from '@/lib/forge/issue-service';

export default async function ProjectBoardPage({ params }: {
  params: Promise<{ workspaceId: string; projectSlug: string }>;
}) {
  const { workspaceId, projectSlug } = await params;
  const board = await loadForgeBoard(workspaceId, projectSlug);
  if (board.kind === 'denied') notFound();
  const rights = await loadForgeIssueRights(workspaceId, projectSlug);
  return <ForgeBoardView initial={board} rights={rights} workspaceSlug={workspaceId} projectSlug={projectSlug} />;
}
