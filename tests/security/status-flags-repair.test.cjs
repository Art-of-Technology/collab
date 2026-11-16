const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { seatsDatabase } = require('../agents/seats-db.cjs');

let db;
after(() => db?.stop());

// name, order, then flags: D default, F final, I inactive. Rows are stored in this order.
const projects = {
  // Web-made before CLB-505 and CLB-524, stored last status first: five defaults, no final status.
  five: [['canceled', 3, 'D'], ['done', 2, 'D'], ['in_progress', 1, 'D'], ['todo', 0, 'D'], ['backlog', -1, 'D']],
  // Saved by the settings page: backlog and done were both defaults.
  two: [['backlog', 0, 'D'], ['todo', 1, ''], ['done', 3, 'DF']],
  // A non-final "done" beside a final status is somebody's choice.
  chosen: [['todo', 0, 'D'], ['done', 1, ''], ['released', 2, 'F']],
  // No default is in the to do group: the first of all by order stays.
  late: [['todo', 0, ''], ['in_progress', 1, 'D'], ['done', 2, 'DF']],
  // An inactive status does not stay the default while an active one can; of two with the same order the lower id stays.
  hidden: [['backlog', 0, 'DI'], ['todo', 1, 'D'], ['ready', 1, 'D'], ['Completed', 2, '']],
  // Already right.
  fine: [['todo', 0, 'D'], ['done', 1, 'F'], ['canceled', 2, '']],
};
const expected = {
  five: ['canceled 3 ', 'done 2 F', 'in_progress 1 ', 'todo 0 ', 'backlog -1 D'],
  two: ['backlog 0 D', 'todo 1 ', 'done 3 F'],
  chosen: ['todo 0 D', 'done 1 ', 'released 2 F'],
  late: ['todo 0 ', 'in_progress 1 D', 'done 2 F'],
  hidden: ['backlog 0 I', 'todo 1 D', 'ready 1 ', 'Completed 2 F'],
  fine: ['todo 0 D', 'done 1 F', 'canceled 2 '],
  // Made after the seats migration, so without a group: "done" reads as done once it is final, and "todo" stays the default.
  ungrouped: ['done 0 F', 'todo 1 D'],
};

test('the repair leaves each project one default status and makes a lone done final (CLB-524)', async () => {
  const row = (project, [name, order, flags], index) => ({ id: `${project}-${index}`, projectId: project, name, displayName: name, order,
    isDefault: flags.includes('D'), isFinal: flags.includes('F'), isActive: !flags.includes('I') });
  db = await seatsDatabase(async prisma => {
    await prisma.user.create({ data: { id: 'owner', name: 'owner' } });
    await prisma.workspace.create({ data: { id: 'w', name: 'w', slug: 'w', ownerId: 'owner' } });
    for (const [project, statuses] of Object.entries({ ...projects, ungrouped: [] })) {
      await prisma.project.create({ data: { id: project, workspaceId: 'w', name: project, slug: project, issuePrefix: project.toUpperCase() } });
      await prisma.projectStatus.createMany({ data: statuses.map((status, index) => row(project, status, index)) });
    }
  });
  const { prisma } = db;
  await prisma.projectStatus.createMany({ data: [['done', 0, 'D'], ['todo', 1, 'D']].map((status, index) => row('ungrouped', status, index)) });

  const stored = async () => {
    const result = {};
    for (const status of await prisma.projectStatus.findMany({ orderBy: { id: 'asc' } })) {
      (result[status.projectId] ??= []).push(`${status.name} ${status.order} ${status.isDefault ? 'D' : ''}${status.isFinal ? 'F' : ''}${status.isActive ? '' : 'I'}`);
    }
    return result;
  };
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const repair = () => execFileSync(`${bindir}/psql`, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db.url, '-f', resolve('prisma/migrations/20261116000300_repair_status_flags/migration.sql')], { stdio: 'pipe' });

  repair();
  assert.deepEqual(await stored(), expected);
  repair();
  assert.deepEqual(await stored(), expected, 'a second run changes nothing');
});
