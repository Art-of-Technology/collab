import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';

/**
 * The repository Collab works out for an issue, so that nobody types an address into a runner. It is always taken
 * from the issue's project, never from the seat's, so the same code serves a workspace seat later.
 */
export interface SeatRepository {
  /** The row the address came from: a `Repository` of the GitHub sign-in, a `GitConnection`, or the project an address was typed on. */
  id: string;
  /** `github` for the GitHub sign-in, `address` for an address typed on the project, otherwise the connection's own provider, lowercased. */
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

/** A connected row with what makes two rows the same repository, so a saved default survives the row it was saved as. */
type Connected = { key: string; repository: SeatRepository };

// The server is part of what makes it the same repository, as it is in `GitConnection`'s own key: the same path at two
// servers is two repositories, and a project that has both picks between them rather than cloning the older row. It is
// compared letter for letter, as `resolveInstance` and that key both compare it, because a URL's path is case-sensitive:
// two configured instances that differ only in the case of theirs are two servers here as they are everywhere else. The
// path at the provider is compared without case, as every provider Collab connects to reads it that way, so the same
// repository connected twice is one; the provider is stored in either case by the client and is folded with it.
const repositoryKey = (provider: string, server: string, path: string) => [provider.toLowerCase(), server, path.toLowerCase()].join(' ');

/**
 * Every active row of the project, the GitHub sign-in's first. A credential is never selected: `Repository.accessToken`
 * and `GitConnection.credentials` do not leave the server, and the runner clones with its owner's own sign-in.
 */
async function connectedRows(db: Database, projectId: string): Promise<Connected[]> {
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
  return all.map(entry => ({ key: repositoryKey(entry.repository.provider, entry.server, entry.repository.name), repository: entry.repository }));
}

/**
 * The repository a saved default names, where no active row carries that id any more: the row it was saved as may have
 * been switched off or disconnected while a second connection of the same repository stays. Read in that case only.
 */
async function savedRepositoryKey(db: Database, projectId: string, savedId: string): Promise<string | null> {
  // Within the project, so an id belonging to another one names nothing here.
  const github = await db.repository.findFirst({ where: { id: savedId, projectId }, select: { fullName: true } });
  if (github) return repositoryKey('github', 'https://github.com', github.fullName);
  const connection = await db.gitConnection.findFirst({ where: { id: savedId, projectId }, select: { provider: true, baseUrl: true, repositoryPath: true } });
  return connection ? repositoryKey(connection.provider, connection.baseUrl, connection.repositoryPath) : null;
}

/**
 * The project's row, held until the transaction ends. Choosing the default and disconnecting the row it is saved as
 * both read which repositories the project has and then write the choice, so without this one would write over what
 * the other decided, or save a row the other has just deleted. Both take it before they read, so they take turns.
 */
export async function holdProjectDefault(db: Database, projectId: string) {
  await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
}

/**
 * A row about to be deleted outright, as the GitHub sign-in's disconnect deletes its `Repository`, takes no choice with
 * it: where it was the project's default and another row represents the same repository, that row holds the choice from
 * now on, and where none does the choice is cleared rather than left naming a row that is gone. Called before the
 * delete, in its transaction, while the row can still say which repository it was.
 */
export async function transferDefaultRepository(db: Database, projectId: string | null, rowId: string) {
  if (!projectId) return;
  await holdProjectDefault(db, projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { agentDefaultRepositoryId: true } });
  if (project?.agentDefaultRepositoryId !== rowId) return;
  const key = await savedRepositoryKey(db, projectId, rowId);
  // Not `distinct`, which answers with the sign-in's row: the row that stays is wanted, and that is the other one.
  const successor = key ? (await connectedRows(db, projectId)).find(row => row.key === key && row.repository.id !== rowId) : undefined;
  // Written only while the choice is still this row, so nothing else's choice is written over even without the hold.
  await db.project.updateMany({ where: { id: projectId, agentDefaultRepositoryId: rowId },
    data: { agentDefaultRepositoryId: successor?.repository.id ?? null } });
}

/** One repository connected twice, by the GitHub sign-in and as a connection, is one repository: the sign-in's row wins. */
const distinct = (rows: Connected[]) => rows.filter((row, index) => rows.findIndex(other => other.key === row.key) === index);

/** The project's repositories, the GitHub sign-in's first, one entry for a repository connected twice. */
export async function connectedRepositories(db: Database, projectId: string): Promise<SeatRepository[]> {
  return distinct(await connectedRows(db, projectId)).map(row => row.repository);
}

/**
 * An address typed on a project: the https address of a repository, or null. No sign-in may be part of it, in the user
 * part or in a query, because what is saved here leaves the server with every checkout; the runner clones with its
 * owner's own sign-in. Read by the route that saves it, and again by every read of what was saved.
 */
export function repositoryAddress(value: string): URL | null {
  value = value.trim();
  if (value.length > 2048) return null;
  let address: URL;
  try { address = new URL(value); } catch { return null; }
  // A path that names something: a server's address alone is no repository.
  const names = address.pathname.replace(/\//g, '');
  return address.protocol === 'https:' && names && !address.username && !address.password && address.href.length <= 2048 && !address.href.includes('?') && !address.href.includes('#') ? address : null;
}

/**
 * A default whose repository is connected no more never resolves, nor does an id belonging to another project; the
 * same holds for `pick`, a seat's own choice, which comes before the default. A project with nothing connected answers
 * with the address typed on it, where there is one: a connected repository always comes before a typed address.
 */
export async function projectRepositoryState(db: Database, projectId: string, pick?: string | null) {
  const rows = await connectedRows(db, projectId);
  const chosen = distinct(rows);
  const repositories = chosen.map(row => row.repository);
  if (repositories.length === 1) return { repositories, repository: repositories[0] };
  const project = await db.project.findUnique({ where: { id: projectId }, select: { agentDefaultRepositoryId: true, agentRepositoryUrl: true } });
  if (!repositories.length) {
    const address = project?.agentRepositoryUrl ? repositoryAddress(project.agentRepositoryUrl) : null;
    // No row holds a typed address, so the project it was typed on stands in for one.
    const typed: SeatRepository | null = address && { id: projectId, provider: 'address', name: address.pathname.replace(/^\/+|(\.git)?\/*$/g, ''),
      url: address.href, defaultBranch: null };
    return { repositories, repository: typed };
  }
  // Each is saved as one row's id, and a repository connected twice has two of them. The repository it names
  // answers while it is connected at all, whichever of its rows represents it now: connecting the same repository
  // again, or switching off the row that won, changes which row that is but not the choice that was made.
  for (const savedId of [pick, project?.agentDefaultRepositoryId]) {
    const key = !savedId ? null : rows.find(row => row.repository.id === savedId)?.key ?? await savedRepositoryKey(db, projectId, savedId);
    const repository = key && chosen.find(row => row.key === key)?.repository;
    if (repository) return { repositories, repository };
  }
  return { repositories, repository: null };
}

/** The seat's own pick first, then what its project works out. */
export async function repositoryStateForSeat(db: Database, projectId: string, seat: { role: string; repositoryId?: string | null } | null) {
  // The role first, so that a seat which works in none is answered null whatever its project has: a lead handed a
  // repository would be told to work in a copy it has no business in, and the run context answers null for it.
  if (!seat || !NEEDS_REPOSITORY.includes(seat.role)) return { repositories: [] as SeatRepository[], repository: null };
  return projectRepositoryState(db, projectId, seat.repositoryId);
}

/**
 * The same repository for a session reading its run context: a project that works none out answers null here. The role is the one of the seat the issue is assigned to, so the read answers what that
 * issue's checkout answers: an issue held by a person, or by a seat that works in no repository, is null here too.
 */
export async function repositoryOfIssue(db: Database, projectId: string, assigneeId: string | null): Promise<SeatRepository | null> {
  const seat = assigneeId ? await db.agentSeat.findUnique({ where: { userId: assigneeId }, select: { role: true, retiredAt: true, repositoryId: true } }) : null;
  if (!seat || seat.retiredAt || !NEEDS_REPOSITORY.includes(seat.role)) return null;
  return (await projectRepositoryState(db, projectId, seat.repositoryId)).repository;
}
