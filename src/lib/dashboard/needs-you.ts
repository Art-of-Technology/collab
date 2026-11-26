import 'server-only';
import type { Prisma } from '@prisma/client';
import { earlyAnswers, isStopIssueDone, lastAssigned } from '@/lib/agent-stop-boundary';
import { readForgeBindings } from '@/lib/forge/reader';
import { repositoryAccessWhere } from '@/lib/github/access';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { checkUserPermission, Permission } from '@/lib/permissions';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { prisma } from '@/lib/prisma';
import type { DashboardScope, NeedsYouItem, NeedsYouKind, NeedsYouOverview } from '@/types/workspace-dashboard';

const day = 86_400_000;
const projectSelect = { id: true, slug: true, name: true, color: true } as const;
const kindOrder = { question: 0, review: 0, failed: 1, due: 2 };
const issueKeyPattern = '[A-Z][A-Z0-9]*-\\d+';
const issueKey = new RegExp(`^${issueKeyPattern}$`, 'i');
const listItem = /^[ \t]*(?:\d+[.)]|[-*+])[ \t]+/;
const replyListItem = /^[ \t]*(?:\d+[.)]|[-*+])[ \t]+`([^`]+)`/;
const replyMarker = /\brepl(?:y|ies)\b|\bas a comment on\b|\b(?:reply|comment)\s+`[^`]+`\s+on\b/i;
const recommendation = /\b(?:recommend(?:ed)?|suggest\w*)\b/i;
const replyLead = '(?:repl(?:y|ies)(?:\\s+belongs?)?|(?:as a )?comment)';
// "Reply on", "as a comment on" and "comment `word` on" name a destination anywhere in the comment;
// a bare "comment on" does so only in the reply part, so a remark like "I left a comment on X" is not one.
const destinationLead = new RegExp(`\\b(?:${replyLead}\\s+\`[^\`]+\`|repl(?:y|ies)(?:\\s+belongs?)?|as a comment)\\s+on\\s+`, 'gi');
const replyPartLead = new RegExp(`\\b${replyLead}(?:\\s+\`[^\`]+\`)?\\s+on\\s+`, 'gi');
const destinationKey = new RegExp(
  `^(?:\`?(${issueKeyPattern})\\b|\\[[^\\]\\r\\n]*\\]\\([^\\s)]*/(${issueKeyPattern})\\b[^\\s)]*\\))`, 'i',
);

/** What a finish says it asks the person (`askOf` in src/lib/agent-runs.ts). */
type Ask = { kind: 'decision'; questions: Array<{ question: string; options: string[]; suggested?: string }> }
  | { kind: 'hands'; steps: string; doneWord: string };
type ExitFacts = { askedUser: string; pullRequest: string | null; nextStep: string | null; ask: Ask | null };
type Repository = { provider: string; baseUrl: string; repositoryPath: string };

function readFinish(details: string | null) {
  try {
    const facts = JSON.parse(details ?? 'null');
    if (typeof facts?.runId !== 'string' || typeof facts.askedUser !== 'string' || !facts.askedUser) return null;
    const { ask } = facts;
    // The finish checked it. One written any other way is not shown: the row falls back to the seat's comment.
    const declared = ask?.kind === 'hands' ? typeof ask.steps === 'string' && typeof ask.doneWord === 'string'
      : ask?.kind === 'decision' && Array.isArray(ask.questions) && ask.questions.length > 0 && ask.questions.every((item: Record<string, unknown> | null) =>
        typeof item?.question === 'string' && Array.isArray(item.options) && item.options.every(option => typeof option === 'string')
        && (item.suggested === undefined || typeof item.suggested === 'string'));
    return {
      ask: declared ? ask as Ask : null,
      runId: facts.runId as string,
      askedUser: facts.askedUser as string,
      pullRequest: typeof facts.pullRequest === 'string' && facts.pullRequest ? facts.pullRequest as string : null,
      nextStep: typeof facts.nextStep === 'string' ? facts.nextStep as string : null,
    };
  } catch {
    return null;
  }
}

function isReplyWord(word: string) {
  return !!word && word.length <= 40 && !/[/\\]/.test(word) && !issueKey.test(word) && !/^[a-f0-9]{7,40}$/i.test(word);
}

function replyDetails(content: string) {
  const lines = content.split(/\r\n?|\n/);
  // Include instructions written as a list, even when each item repeats "Reply".
  let start = lines.findLastIndex(line => {
    const listedWord = replyListItem.exec(line)?.[1].trim();
    return replyMarker.test(line) || (listedWord && isReplyWord(listedWord));
  });
  if (start >= 0 && listItem.test(lines[start])) {
    for (let i = start - 1; i >= 0 && (listItem.test(lines[i]) || !lines[i].trim()); i--) {
      if (listItem.test(lines[i])) start = i;
    }
  }

  const options: string[] = [];
  let suggested: string | null = null;
  const replyPart = start < 0 ? '' : lines.slice(start).join('\n');
  for (const item of start < 0 ? [] : replyPart.split(/\n(?=\s*(?:\d+[.)]|[-*+])\s+)/)) {
    const matches = [...item.matchAll(/(?<!`)`([^`\r\n]+)`(?!`)/g)];
    for (const [index, match] of matches.entries()) {
      const word = match[1].trim();
      if (!isReplyWord(word)) continue;
      if (!options.includes(word) && options.length < 4) options.push(word);
      if (suggested || !options.includes(word)) continue;
      const offset = match.index;
      const lineStart = item.lastIndexOf('\n', offset - 1) + 1;
      const nextLine = item.indexOf('\n', offset);
      const lineEnd = nextLine < 0 ? item.length : nextLine;
      const previous = matches[index - 1];
      const next = matches[index + 1];
      const prefix = item.slice(Math.max(lineStart, previous ? previous.index + previous[0].length : 0), offset);
      const suffix = item.slice(offset + match[0].length, Math.min(lineEnd, next?.index ?? item.length));
      if ((matches.length === 1 && listItem.test(item) && recommendation.test(item))
        || recommendation.test(prefix.split(/\b(?:or|and)\b|,/i).at(-1) ?? '')
        || recommendation.test(suffix.split(/\b(?:or|and)\b|,/i)[0])) suggested = word;
    }
  }

  const destinations = new Set<string>();
  const leads = [
    ...[...content.matchAll(destinationLead)].map(lead => content.slice(lead.index + lead[0].length)),
    ...[...replyPart.matchAll(replyPartLead)].map(lead => replyPart.slice(lead.index + lead[0].length)),
  ];
  for (let rest of leads) {
    for (let match = destinationKey.exec(rest); match; match = destinationKey.exec(rest)) {
      destinations.add((match[1] || match[2]).toUpperCase());
      rest = rest.slice(match[0].length).replace(/^`/, '');
      const separator = /^(?:[ \t]+(?:or|and)[ \t]+|,[ \t]*)/i.exec(rest);
      if (!separator) break;
      rest = rest.slice(separator[0].length);
    }
  }
  return { options, suggested, destinations: [...destinations] };
}

function redactDestinations(text: string, keys: string[]) {
  return text.replace(new RegExp(`\\b(?:${keys.join('|')})\\b`, 'gi'), '[issue unavailable]');
}

// Apply the repository overview's HTTP(S) and credential checks to the configured instance.
function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function reviewUrl(reference: string, repositories: Repository[]): string | null {
  const match = /^([\w.-]{1,100}\/[\w.-]{1,100})#([1-9]\d{0,9})$/.exec(reference);
  if (!match) return null;
  const [, path, number] = match;
  if (path.split('/').some(segment => segment === '.' || segment === '..')) return null;
  const matches = new Map<string, Repository>();
  for (const repository of repositories) {
    if (repository.repositoryPath.toLowerCase() !== path.toLowerCase()) continue;
    const provider = repository.provider.toLowerCase();
    const baseUrl = repository.baseUrl.replace(/\/+$/, '');
    // The GitHub sign-in and a provider connection can name the same repository.
    const key = `${provider} ${baseUrl}`;
    if (!matches.has(key)) matches.set(key, { ...repository, provider, baseUrl });
  }
  if (matches.size !== 1) return null;
  const [{ provider, baseUrl, repositoryPath }] = matches.values();
  const base = safeUrl(baseUrl);
  if (!base || base.search || base.hash) return null;
  const [owner, repo] = repositoryPath.split('/').map(encodeURIComponent);
  const repository = `${owner}/${repo}`;
  const routes: Record<string, string> = {
    github: `${repository}/pull/${number}`,
    forgejo: `${repository}/pulls/${number}`,
    gitlab: `${repository}/-/merge_requests/${number}`,
    bitbucket: `${repository}/pull-requests/${number}`,
    'bitbucket-dc': `projects/${owner}/repos/${repo}/pull-requests/${number}/overview`,
  };
  const route = Object.hasOwn(routes, provider) ? routes[provider] : null;
  return route ? safeUrl(`${base.href.replace(/\/+$/, '')}/${route}`)?.href ?? null : null;
}

export async function loadNeedsYou({
  actorId, workspaceId, scope, kind, now = new Date(),
}: {
  actorId: string;
  workspaceId: string;
  scope: DashboardScope;
  kind?: NeedsYouKind;
  now?: Date;
}): Promise<NeedsYouOverview> {
  if (!actorId || !workspaceId) return { kind: 'denied' };
  try {
    const workspaceAccess = postWorkspaceAccessWhere(actorId);
    const workspace = await prisma.workspace.findFirst({ where: { ...workspaceAccess, id: workspaceId }, select: { id: true } });
    if (!workspace) return { kind: 'denied' };
    const permission = await checkUserPermission(actorId, workspaceId, Permission.VIEW_TASKS);
    if (permission.reason === 'Internal error') return { kind: 'unavailable' };
    if (!permission.hasPermission) return { kind: 'denied' };

    const projectWhere = { workspaceId, workspace: workspaceAccess, OR: [{ isArchived: false }, { isArchived: null }] };
    const readableIssues = { workspaceId, project: projectWhere, AND: [issueReadAccessWhere(actorId)] };
    const dueBefore = new Date(now.getTime() + 7 * day);
    // Probe the issue/start index for the latest run, so past finishes cannot put old issues in the candidate set.
    // This returns IDs only. All issue and run data below is read through issueReadAccessWhere.
    const runCandidates = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT issue.id
      FROM "Issue" issue
      JOIN "Project" project ON project.id = issue."projectId"
      JOIN LATERAL (
        SELECT id, "workspaceId", "seatId", state, outcome, "endedAt", "leaseUntil"
        FROM "AgentRun"
        WHERE "issueId" = issue.id
        ORDER BY "startedAt" DESC, id DESC
        LIMIT 1
      ) run ON run."workspaceId" = issue."workspaceId"
      WHERE issue."workspaceId" = ${workspaceId} AND issue."deletedAt" IS NULL
        AND project."workspaceId" = issue."workspaceId" AND project."isArchived" IS NOT TRUE
        AND (
          (run."endedAt" IS NULL AND (run.state = 'lost' OR run."leaseUntil" < ${now}))
          OR (issue."assigneeId" IS NOT NULL AND run."seatId" IS NOT NULL AND run."endedAt" IS NOT NULL
            AND run.state = 'finished' AND run.outcome IN ('blocked', 'in_review'))
        )
    `;
    const issues = await prisma.issue.findMany({
      where: {
        ...readableIssues,
        OR: [
          { assigneeId: actorId, dueDate: { lt: dueBefore } },
          { id: { in: runCandidates.map(row => row.id) } },
        ],
      },
      select: {
        id: true, issueKey: true, title: true, project: { select: projectSelect }, assigneeId: true, createdAt: true, dueDate: true,
        status: true, statusValue: true, projectStatus: { select: { category: true, isFinal: true } },
        helpers: { select: { userId: true, approvedAt: true, assignedAt: true } },
        // An open run is unique per issue and is always the latest. Fetch the latest before testing its outcome.
        agentRuns: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1, select: {
          id: true, workspaceId: true, userId: true, state: true, outcome: true, startedAt: true, endedAt: true, leaseUntil: true,
          seat: { select: { id: true, name: true, userId: true, ownerId: true, projectId: true, workspaceId: true } },
        } },
      },
    });
    const rows: NeedsYouItem[] = [];
    const waiting = new Map<string, {
      issue: NeedsYouItem['issue'];
      seat: { id: string; name: string; ownerId: string | null; userId: string };
      runId: string;
      startedAt: Date;
      endedAt: Date;
    }>();
    const due: Array<{ issue: NeedsYouItem['issue']; since: Date }> = [];
    const add = (kind: NeedsYouKind, issue: NeedsYouItem['issue'], since: Date, details: Partial<NeedsYouItem> = {}) => {
      rows.push({ kind, id: `${kind}:${issue.id}`, issue, since: since.toISOString(), seat: null,
        text: null, question: null, ask: 'none', replyOn: null, options: [], suggested: null,
        pullRequestUrl: null, runId: null, canAct: false, ...details });
    };

    for (const { id, issueKey, title, project, assigneeId, createdAt, dueDate, status, statusValue, projectStatus, helpers, agentRuns } of issues) {
      const issue = { id, issueKey, title, project };
      const done = isStopIssueDone({ projectStatus, statusValue, status });
      if (!(projectStatus?.isFinal ?? done) && assigneeId === actorId && dueDate && dueDate < dueBefore) {
        due.push({ issue, since: dueDate });
      }
      const run = agentRuns[0];
      if (!run || run.workspaceId !== workspaceId) continue;
      const seat = run.seat?.workspaceId === workspaceId && run.seat.projectId === project.id ? run.seat : null;
      if (!run.endedAt && (run.state === 'lost' || (run.leaseUntil && run.leaseUntil < now))) {
        if (scope === 'all' || assigneeId === actorId || seat?.ownerId === actorId) {
          add('failed', issue, run.leaseUntil ?? run.startedAt, { runId: run.id, seat: seat && { id: seat.id, name: seat.name } });
        }
      }

      if (done || !seat || assigneeId !== seat.userId || run.userId !== seat.userId || run.state !== 'finished'
        || !run.endedAt || (run.outcome !== 'blocked' && run.outcome !== 'in_review')) continue;
      if (run.endedAt >= lastAssigned({ assigneeId, createdAt, helpers })) {
        waiting.set(id, { issue, seat, runId: run.id, startedAt: run.startedAt, endedAt: run.endedAt });
      }
    }

    const waitingIds = [...waiting.keys()];
    const dueProjects = [...new Set(due.map(row => row.issue.project.id))];
    const oldestStart = [...waiting.values()].reduce((earliest, row) => Math.min(earliest, row.startedAt.getTime()), now.getTime());
    const [finishes, comments, activeProjects] = await Promise.all([
      waitingIds.length ? prisma.issueActivity.findMany({
        where: { workspaceId, itemType: 'ISSUE', itemId: { in: waitingIds }, action: 'AGENT_RUN_FINISHED' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { itemId: true, projectId: true, userId: true, details: true },
      }) : [],
      waitingIds.length ? prisma.issueComment.groupBy({
        by: ['issueId', 'authorId'],
        where: { issueId: { in: waitingIds }, issue: readableIssues, createdAt: { gte: new Date(oldestStart) } },
        _max: { createdAt: true },
      }) : [],
      dueProjects.length ? prisma.issue.groupBy({
        by: ['projectId'],
        where: { ...readableIssues, projectId: { in: dueProjects }, updatedAt: { gte: new Date(now.getTime() - 30 * day) } },
      }) : [],
    ]);

    const answered = new Set<string>();
    const commentDates = new Map<string, Date>();
    const during = new Set<string>();
    for (const reply of comments) {
      const current = waiting.get(reply.issueId);
      const latest = reply._max.createdAt;
      if (!current || !latest || latest < current.startedAt) continue;
      // Seats write their question during the run; only a later comment by someone else answers it.
      if (reply.authorId === current.seat.userId) commentDates.set(reply.issueId, latest);
      else if (latest > current.endedAt) answered.add(reply.issueId);
      else during.add(reply.issueId);
    }
    // Somebody else commented during the run: a person's comment that is later than the seat's last comment of that run
    // answers it, since the seat asks and finishes a moment later. The seat's inbox and its next run's context read the same rule.
    for (const issueId of (await earlyAnswers(prisma, [...during].filter(issueId => !answered.has(issueId)).map(issueId => {
      const { seat, startedAt, endedAt } = waiting.get(issueId)!;
      return { issueId, seatUserId: seat.userId, startedAt, endedAt };
    }))).keys()) answered.add(issueId);
    const factsByIssue = new Map<string, ExitFacts>();
    for (const activity of finishes) {
      const current = waiting.get(activity.itemId);
      if (!current || answered.has(activity.itemId) || factsByIssue.has(activity.itemId)
        || activity.projectId !== current.issue.project.id || activity.userId !== current.seat.userId) continue;
      const facts = readFinish(activity.details);
      if (facts?.runId === current.runId) factsByIssue.set(activity.itemId, facts);
    }

    const waitingSeats = new Map<string, { seatId: string; issueKey: string | null }>();
    const orderedWaiting = [...waiting.values()].sort((a, b) => a.endedAt.getTime() - b.endedAt.getTime() || a.issue.id.localeCompare(b.issue.id));
    const seatRows = orderedWaiting.flatMap(row => {
      const { issue, seat } = row;
      const facts = factsByIssue.get(issue.id);
      if (!facts) return [];
      if (!waitingSeats.has(seat.id)) waitingSeats.set(seat.id, { seatId: seat.id, issueKey: issue.issueKey });
      return scope === 'all' || facts.askedUser === actorId || seat.ownerId === actorId || seat.userId === actorId
        ? [{ ...row, facts }] : [];
    });

    // The grouped read supplies the exact timestamps, so we fetch no comment history.
    const latestCommentWhere = seatRows.flatMap(({ issue, seat }) => {
      const createdAt = commentDates.get(issue.id);
      return createdAt ? [{ issueId: issue.id, authorId: seat.userId, createdAt }] : [];
    });
    const latestComments = latestCommentWhere.length ? await prisma.issueComment.findMany({
      where: { issue: readableIssues, OR: latestCommentWhere },
      select: { issueId: true, content: true },
      orderBy: { id: 'desc' },
      distinct: ['issueId'],
    }) : [];
    const commentByIssue = new Map(latestComments.map(comment => [comment.issueId, comment.content]));
    const parsedRows = seatRows.map(row => {
      // A finish that says what it asks is not read out of a comment, so it names no other issue for the reply.
      const content = row.facts.ask ? undefined : commentByIssue.get(row.issue.id);
      const { options, suggested, destinations } = replyDetails(content ?? '');
      return { ...row, content, options, suggested,
        destinations: destinations.filter(key => key !== row.issue.issueKey?.toUpperCase()) };
    });
    const targetKeys = [...new Set(parsedRows.flatMap(row => row.destinations))];
    const targets = targetKeys.length ? await prisma.issue.findMany({
      where: { workspaceId, project: { workspaceId }, AND: [issueReadAccessWhere(actorId)], issueKey: { in: targetKeys } },
      select: { id: true, issueKey: true },
    }) : [];
    const targetByKey = new Map<string, NeedsYouItem['replyOn']>();
    for (const target of targets) {
      if (!target.issueKey) continue;
      targetByKey.set(target.issueKey, targetByKey.has(target.issueKey) ? null : { id: target.id, issueKey: target.issueKey });
    }
    for (const { issue, seat, runId, endedAt, facts, content, options, suggested, destinations } of parsedRows) {
      if (facts.ask) {
        const declared = facts.ask;
        // One question is answered here. Several are answered on the issue, and work for the person's hands waits on them.
        add(facts.pullRequest ? 'review' : 'question', issue, endedAt, { seat: { id: seat.id, name: seat.name }, runId, text: facts.nextStep,
          ...(declared.kind === 'hands' ? { question: `${declared.steps}\n\nWhen it is done, reply: ${declared.doneWord}` }
            : declared.questions.length > 1 ? { ask: 'issue', question: declared.questions.map((item, index) =>
              `${index + 1}. ${item.question}\nReply words: ${item.options.join(', ')}.${item.suggested ? ` Suggested: ${item.suggested}.` : ''}`).join('\n\n') }
            : { ask: 'here', question: declared.questions[0].question, options: declared.questions[0].options, suggested: declared.questions[0].suggested ?? null }) });
        continue;
      }
      const [destination] = destinations;
      const target = destinations.length === 1 ? targetByKey.get(destination) : null;
      const ask = !options.length || (destinations.length > 0 && !target) ? 'none' : target ? 'elsewhere' : 'here';
      const hiddenKeys = destinations.filter(key => !targetByKey.get(key));
      const visible = (text: string | null) => text && hiddenKeys.length ? redactDestinations(text, hiddenKeys) : text;
      add(facts.pullRequest ? 'review' : 'question', issue, endedAt, {
        seat: { id: seat.id, name: seat.name },
        runId,
        text: visible(facts.nextStep),
        question: visible(content ?? facts.nextStep)?.slice(0, 2000) ?? null,
        ask,
        replyOn: ask === 'elsewhere' ? target ?? null : null,
        options: ask === 'none' ? [] : options,
        suggested: ask === 'none' ? null : suggested,
      });
    }
    const activeIds = new Set(activeProjects.map(project => project.projectId));
    for (const row of due) if (activeIds.has(row.issue.project.id)) add('due', row.issue, row.since);

    const counts = { question: 0, review: 0, failed: 0, due: 0 };
    const byProject = new Map<string, number>();
    for (const row of rows) {
      counts[row.kind]++;
      const projectId = row.issue.project.id;
      byProject.set(projectId, (byProject.get(projectId) ?? 0) + 1);
    }
    const oldest = rows.find(row => row.ask !== 'none');
    const items = rows.filter(row => !kind || row.kind === kind)
      .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || Number(a.ask === 'none') - Number(b.ask === 'none')
        || a.since.localeCompare(b.since) || a.id.localeCompare(b.id)).slice(0, 20);
    const reviewProjects = [...new Set(items.filter(item => item.kind === 'review').map(item => item.issue.project.id))];
    const repoProjects = { ...projectWhere, id: { in: reviewProjects } } satisfies Prisma.ProjectWhereInput;
    const [connections, github, assign, forgeBindings] = await Promise.all([
      reviewProjects.length ? prisma.gitConnection.findMany({
        where: { isActive: true, project: repoProjects },
        select: { projectId: true, provider: true, baseUrl: true, repositoryPath: true },
      }) : [],
      reviewProjects.length ? prisma.repository.findMany({
        where: { isActive: true, AND: [repositoryAccessWhere(actorId), { project: repoProjects }] },
        select: { projectId: true, fullName: true },
      }) : [],
      items.some(item => item.kind === 'failed') ? checkUserPermission(actorId, workspaceId, Permission.ASSIGN_TASK) : null,
      items.some(item => item.kind === 'question' || item.kind === 'review') ? readForgeBindings() : [],
    ]);
    const repositories = [...github.map(row => ({ projectId: row.projectId, provider: 'github',
      baseUrl: 'https://github.com', repositoryPath: row.fullName })), ...connections];
    const forgeProjects = new Set(forgeBindings.map(binding => binding.projectId));
    for (const item of items) {
      // An answer and Continue are both a comment on the issue, which a project worked on the Forge board does not take here.
      if (item.kind === 'question' || item.kind === 'review') item.canAct = !forgeProjects.has(item.issue.project.id);
      if (item.kind === 'failed') item.canAct = assign?.hasPermission ?? false;
      const reference = factsByIssue.get(item.issue.id)?.pullRequest;
      if (item.kind === 'review' && reference) {
        item.pullRequestUrl = reviewUrl(reference, repositories.filter(repo => repo.projectId === item.issue.project.id));
      }
    }

    return {
      kind: 'ready', generatedAt: now.toISOString(),
      oldestQuestion: oldest?.seat ? { seatName: oldest.seat.name, since: oldest.since } : null,
      items, counts, byProject: Object.fromEntries(byProject), waitingSeats: [...waitingSeats.values()],
    };
  } catch {
    console.error('Workspace Needs you overview unavailable');
    return { kind: 'unavailable' };
  }
}
