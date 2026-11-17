import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';
import { HandoffError } from '@/lib/agent-seats';

/**
 * The repository Collab works out for an issue, so that nobody types an address into a runner. It is always taken
 * from the issue's project, never from the seat's, so the same code serves a workspace seat later.
 */
export interface SeatRepository {
  /** The row the address came from: a `Repository` of the GitHub sign-in, or a `GitConnection`. */
  id: string;
  /** `github` for the GitHub sign-in, otherwise the connection's own provider, lowercased. */
  provider: string;
  /** The repository's path at its provider, `owner/name`. */
  name: string;
  /** What the runner clones. */
  url: string;
  /** The branch the provider says is the default, where Collab knows it. */
  defaultBranch: string | null;
}

/**
 * The roles whose work is in a repository. A lead hands work out and needs none, so its checkout succeeds with no
 * repository worked out. The role catalogue takes this over (CLB-605), and a role it does not list needs none.
 */
export const NEEDS_REPOSITORY = ['developer', 'reviewer', 'release', 'security'];

/** Read in a checkout's transaction and outside one, as `agent-seats.ts` does. */
type Database = Prisma.TransactionClient | typeof prisma;

/**
 * The project's repositories, the GitHub sign-in's first. A credential is never selected: `Repository.accessToken`
 * and `GitConnection.credentials` do not leave the server, and the runner clones with its owner's own sign-in.
 */
async function connected(db: Database, projectId: string): Promise<SeatRepository[]> {
  const github = await db.repository.findFirst({ where: { projectId, isActive: true }, select: { id: true, fullName: true, defaultBranch: true } });
  const connections = await db.gitConnection.findMany({ where: { projectId, isActive: true }, orderBy: { createdAt: 'asc' },
    select: { id: true, provider: true, repositoryPath: true, url: true } });
  const all = [
    ...(github ? [{ id: github.id, provider: 'github', name: github.fullName, url: `https://github.com/${github.fullName}`, defaultBranch: github.defaultBranch }] : []),
    ...connections.map(connection => ({ id: connection.id, provider: connection.provider.toLowerCase(), name: connection.repositoryPath, url: connection.url, defaultBranch: null })),
  ];
  // One repository connected twice, by the GitHub sign-in and as a connection, is one repository: the sign-in's row wins.
  return all.filter((repository, index) => all.findIndex(other => other.provider === repository.provider
    && other.name.toLowerCase() === repository.name.toLowerCase()) === index);
}

/** The one repository of a project, or null while there is none or the project has several and nothing picks between them. */
async function only(db: Database, projectId: string) {
  const repositories = await connected(db, projectId);
  return repositories.length === 1 ? repositories[0] : null;
}

/**
 * What a checkout answers with: the seat's own pick, else the project's default for agents, else the project's only
 * repository. Neither the pick nor the default is in the database yet (CLB-603 and CLB-601 add them, and slot in
 * ahead of the line below), so today a project with several repositories works none out.
 *
 * A role that needs no repository gets null and its checkout stands. A role that needs one and gets none is refused
 * with `repository_required`, naming the project, because its session would have nothing to work in. A run that is
 * not a seat's asks for no repository and is never refused: a person works in whatever copy they already have.
 */
export async function repositoryForSeat(db: Database, projectId: string, seat: { role: string } | null): Promise<SeatRepository | null> {
  const repositories = await connected(db, projectId);
  if (repositories.length === 1) return repositories[0];
  if (!seat || !NEEDS_REPOSITORY.includes(seat.role)) return null;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true } });
  const named = project?.name ?? projectId;
  throw new HandoffError('repository_required', repositories.length
    ? `"${named}" has ${repositories.length} repositories and this seat picks none of them: pick one for the seat, or make one the project's default for agents`
    : `"${named}" has no repository connected: connect one to the project, and its seats run with it`, 409);
}

/**
 * The same repository for a session reading its run context. It is a read, so it refuses nothing: a project that
 * works none out answers null, and the checkout is where a seat that needs one is told. The role is the one of the
 * seat the issue is assigned to; an issue held by a person reports what its project has.
 */
export async function repositoryOfIssue(db: Database, projectId: string, assigneeId: string | null): Promise<SeatRepository | null> {
  const seat = assigneeId ? await db.agentSeat.findUnique({ where: { userId: assigneeId }, select: { role: true, retiredAt: true } }) : null;
  if (seat && !seat.retiredAt && !NEEDS_REPOSITORY.includes(seat.role)) return null;
  return only(db, projectId);
}
