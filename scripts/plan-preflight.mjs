import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX_POINTS = 5;
const PERSON_KINDS = new Set(['release', 'machine']);
const CARD_FIELDS = ['title', 'type', 'context', 'wave', 'points'];
const PERSON_FIELDS = ['who', 'word', 'minutes'];

function base(path) {
  return path.replace(/\*\*$/, '').replace(/\/+$/, '');
}

function overlap(left, right) {
  const a = base(left);
  const b = base(right);
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

function pathsOf(issue, contexts) {
  if (issue.paths?.length) return issue.paths;
  return Object.hasOwn(contexts, issue.context) ? contexts[issue.context] : [];
}

function pairsByKey(pairs) {
  return new Map(pairs.map(pair => [JSON.stringify(pair), pair]));
}

function pairDifference(left, right) {
  return [...left.keys()].filter(key => !right.has(key)).sort().map(key => left.get(key));
}

// Keep the Python pre-flight's list format in the "Starts now" diagnostic.
function formatIds(ids) {
  const quoted = ids.map(id => {
    const doubleQuoted = JSON.stringify(id);
    if (id.includes("'") && !id.includes('"')) return doubleQuoted;
    const escaped = doubleQuoted.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'");
    return `'${escaped}'`;
  });
  return `[${quoted.join(', ')}]`;
}

// The optional lookup returns an existing Collab issue or null for an unknown key.
export function check(plan, lookup = null) {
  const fails = [];
  const warns = [];
  const notes = [];
  const { issues = [], contexts = {}, blocks = [], startsNow = [] } = plan;
  const byId = new Map(issues.map(issue => [issue.id, issue]));

  for (const issue of issues) {
    const { id, context, points, kind, person } = issue;
    const hasPerson = Object.keys(person ?? {}).length > 0;
    for (const field of CARD_FIELDS) {
      if (issue[field] == null || issue[field] === '') fails.push(`${id}: the card has no ${field}`);
    }
    if (context && !Object.hasOwn(contexts, context)) {
      fails.push(`${id}: context '${context}' is not in the plan's context table`);
    }
    if (points > MAX_POINTS) fails.push(`${id}: ${points} points; split it (${MAX_POINTS} or less)`);
    if (!issue.tests?.length && !hasPerson) fails.push(`${id}: names no test`);
    if (PERSON_KINDS.has(kind) && !hasPerson) {
      fails.push(`${id}: kind '${kind}' is person-only but has no person`);
    }
    if (issue.migration && !issue.security) {
      fails.push(`${id}: has a migration, so it needs a security review`);
    }
    if (hasPerson && !PERSON_FIELDS.every(field => person[field])) {
      fails.push(`${id}: the person line needs who, word and minutes`);
    }
  }

  for (const [index, a] of issues.entries()) {
    for (const b of issues.slice(index + 1)) {
      if ((a.wave ?? null) !== (b.wave ?? null)) continue;
      if ((a.context ?? null) === (b.context ?? null)) {
        fails.push(`${a.id} and ${b.id}: same wave and same context '${a.context ?? 'None'}'`);
      } else {
        const bPaths = pathsOf(b, contexts);
        const hit = pathsOf(a, contexts).find(path => bPaths.some(other => overlap(path, other)));
        if (hit !== undefined) {
          fails.push(`${a.id} and ${b.id}: same wave and both change ${hit}; split the file first or put them in different waves`);
        }
      }
    }
  }

  const needs = pairsByKey(issues.flatMap(issue => (issue.needs ?? []).map(need => [need, issue.id])));
  const plannedBlocks = pairsByKey(blocks);
  for (const [need, waiting] of pairDifference(needs, plannedBlocks)) {
    fails.push(`${waiting} needs ${need}, but no block is planned for it`);
  }
  for (const [need, waiting] of pairDifference(plannedBlocks, needs)) {
    fails.push(`a block ${need} -> ${waiting} is planned, but ${waiting}'s card does not say it needs ${need}`);
  }

  for (const issue of issues) {
    for (const need of issue.needs ?? []) {
      const blocker = byId.get(need);
      if (!blocker) continue;
      const { wave = 0 } = issue;
      const { wave: blockerWave = 0 } = blocker;
      if (typeof wave === 'number' && typeof blockerWave === 'number' && blockerWave >= wave) {
        fails.push(`${issue.id} (wave ${issue.wave ?? 'None'}) needs ${need} (wave ${blocker.wave ?? 'None'}): it must be in a later wave`);
      }
    }
  }

  const outside = [...new Set([...needs.values()].map(([need]) => need).filter(need => !byId.has(need)))].sort();
  const doneOutside = new Set();
  if (lookup === null) {
    if (outside.length) {
      notes.push(`not checked (offline): the blockers that already exist in Collab: ${outside.join(', ')}`);
    }
  } else {
    for (const key of outside) {
      const issue = lookup(key);
      if (issue == null) {
        fails.push(`${key}: a blocker that Collab does not know`);
        continue;
      }
      if (issue.type === 'SUBTASK') fails.push(`${key} is a sub-task: block on its parent`);
      if (String(issue.status).toLowerCase() === 'done') {
        doneOutside.add(key);
        fails.push(`${key} is already done: drop it from the needs`);
      } else if (!Object.keys(issue.assignee ?? {}).length) {
        warns.push(`${key} has no assignee: nobody may ever finish it. Ask the person: '${key} covered' or '${key} hand out'`);
      }
    }
  }

  const ready = issues.filter(issue => (issue.needs ?? []).every(need => doneOutside.has(need)))
    .map(issue => issue.id).sort();
  const declared = [...startsNow].sort();
  if (declared.length !== ready.length || declared.some((id, index) => id !== ready[index])) {
    fails.push(`'Starts now' says ${formatIds(declared)}; the needs say ${formatIds(ready)}`);
  }

  notes.push('search Collab for an unstarted issue on the same screen or file before filing (collab issues list --project-id ID --search WORDS)');
  return { fails, warns, notes };
}

function collabIssue(key, workspace) {
  const args = ['issues', 'get', key];
  if (workspace) args.push('--workspace', workspace);
  const result = spawnSync('collab', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result.status === 0 ? JSON.parse(result.stdout) : null;
}

function main([file, ...args]) {
  if (!file || file === '--offline') {
    console.error('Usage: node scripts/plan-preflight.mjs PLAN.json [--offline]');
    return 1;
  }

  const plan = JSON.parse(readFileSync(file, 'utf8'));
  const lookup = args.includes('--offline') ? null : key => collabIssue(key, plan.workspace);
  const { fails, warns, notes } = check(plan, lookup);
  for (const message of fails) console.log(`FAIL  ${message}`);
  for (const message of warns) console.log(`ASK   ${message}`);
  for (const message of notes) console.log(`NOTE  ${message}`);
  console.log(`${(plan.issues ?? []).length} issues, ${fails.length} failing, ${warns.length} to ask`);
  return fails.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
