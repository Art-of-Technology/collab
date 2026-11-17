import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';

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
export async function connectedRepositories(db: Database, projectId: string): Promise<SeatRepository[]> {
  // A project has at most one `Repository`: `Repository.projectId` is unique.
  const github = await db.repository.findFirst({ where: { projectId, isActive: true }, select: { id: true, fullName: true, defaultBranch: true } });
  const connections = await db.gitConnection.findMany({ where: { projectId, isActive: true }, orderBy: { createdAt: 'asc' },
    select: { id: true, provider: true, baseUrl: true, repositoryPath: true, url: true } });
  const all = [
    ...(github ? [{ server: 'https://github.com',
      repository: { id: github.id, provider: 'github', name: github.fullName, url: `https://github.com/${github.fullName}`, defaultBranch: github.defaultBranch } }] : []),
    ...connections.map(connection => ({ server: connection.baseUrl,
      repository: { id: connection.id, provider: connection.provider.toLowerCase(), name: connection.repositoryPath, url: connection.url, defaultBranch: null } })),
  ];
  // One repository connected twice, by the GitHub sign-in and as a connection, is one repository: the sign-in's row wins.
  // The server is part of what makes it the same one, as it is in `GitConnection`'s own key: the same path at two
  // servers is two repositories, and a project that has both picks between them rather than cloning the older row.
  const key = (entry: typeof all[number]) => [entry.repository.provider, entry.server.toLowerCase(), entry.repository.name.toLowerCase()].join(' ');
  return all.filter((entry, index) => all.findIndex(other => key(other) === key(entry)) === index).map(entry => entry.repository);
}

/** An inactive or disconnected default never resolves, nor does an id belonging to another project. */
export async function projectRepositoryState(db: Database, projectId: string) {
  const repositories = await connectedRepositories(db, projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { agentDefaultRepositoryId: true } });
  const repository = repositories.length === 1 ? repositories[0]
    : repositories.find(candidate => candidate.id === project?.agentDefaultRepositoryId) ?? null;
  return { repositories, repository };
}

/** The seat's pick will take precedence when seat repository selection is introduced. */
export async function repositoryStateForSeat(db: Database, projectId: string, seat: { role: string } | null) {
  // The role first, so that a seat which works in none is answered null whatever its project has: a lead handed a
  // repository would be told to work in a copy it has no business in, and the run context answers null for it.
  if (!seat || !NEEDS_REPOSITORY.includes(seat.role)) return { repositories: [] as SeatRepository[], repository: null };
  return projectRepositoryState(db, projectId);
}

/**
 * The same repository for a session reading its run context: a project that works none out answers null here. The role is the one of the seat the issue is assigned to, so the read answers what that
 * issue's checkout answers: an issue held by a person, or by a seat that works in no repository, is null here too.
 */
export async function repositoryOfIssue(db: Database, projectId: string, assigneeId: string | null): Promise<SeatRepository | null> {
  const seat = assigneeId ? await db.agentSeat.findUnique({ where: { userId: assigneeId }, select: { role: true, retiredAt: true } }) : null;
  if (!seat || seat.retiredAt || !NEEDS_REPOSITORY.includes(seat.role)) return null;
  return (await projectRepositoryState(db, projectId)).repository;
}
