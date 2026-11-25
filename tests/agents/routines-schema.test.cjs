const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { seatsDatabase } = require('./seats-db.cjs');

const migration = '20261125000400_agent_routines';

test('the migration SQL creates AgentRoutine with its columns and indexes, and the bootstrap recipe pins it', async t => {
  await t.test('PostgreSQL has the routine columns, defaults, foreign keys and indexes', async t => {
    const { prisma, stop } = await seatsDatabase();
    t.after(stop);

    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AgentRoutine'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(columns.map(column => [
      column.column_name, column.data_type, column.is_nullable, column.column_default,
    ]), [
      ['id', 'text', 'NO', null],
      ['workspaceId', 'text', 'NO', null],
      ['projectId', 'text', 'NO', null],
      ['seatId', 'text', 'NO', null],
      ['title', 'text', 'NO', null],
      ['body', 'text', 'NO', null],
      ['everyMinutes', 'integer', 'NO', null],
      ['dailyCap', 'integer', 'NO', '3'],
      ['spendCapUSD', 'numeric', 'YES', null],
      ['nextDueAt', 'timestamp without time zone', 'NO', null],
      ['enabled', 'boolean', 'NO', 'true'],
      ['pausedReason', 'text', 'YES', null],
      ['createdById', 'text', 'NO', null],
      ['createdAt', 'timestamp without time zone', 'NO', 'CURRENT_TIMESTAMP'],
      ['updatedAt', 'timestamp without time zone', 'NO', null],
    ]);

    const constraints = await prisma.$queryRaw`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public."AgentRoutine"'::regclass AND contype IN ('f', 'p')
      ORDER BY definition
    `;
    assert.deepEqual(constraints.map(row => row.definition), [
      'FOREIGN KEY ("createdById") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE',
      'FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON UPDATE CASCADE ON DELETE CASCADE',
      'FOREIGN KEY ("seatId") REFERENCES "AgentSeat"(id) ON UPDATE CASCADE ON DELETE CASCADE',
      'FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON UPDATE CASCADE ON DELETE CASCADE',
      'PRIMARY KEY (id)',
    ]);

    const indexes = await prisma.$queryRaw`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'AgentRoutine' AND indexname <> 'AgentRoutine_pkey'
      ORDER BY indexname
    `;
    assert.deepEqual(indexes.map(row => row.indexdef), [
      'CREATE INDEX "AgentRoutine_enabled_nextDueAt_idx" ON public."AgentRoutine" USING btree (enabled, "nextDueAt")',
      'CREATE INDEX "AgentRoutine_seatId_idx" ON public."AgentRoutine" USING btree ("seatId")',
    ]);
  });

  await t.test('the bootstrap contract pins the migration checksum', () => {
    const contract = require('../../prisma/bootstrap-contract.json');
    const pin = contract.migrations.find(entry => entry.name === migration);
    assert.ok(pin, `${migration} is pinned`);
    const sql = readFileSync(resolve('prisma/migrations', migration, 'migration.sql'));
    assert.equal(pin.sha256, createHash('sha256').update(sql).digest('hex'));
  });
});
