const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir, userInfo } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

/**
 * A throwaway PostgreSQL with the current schema, where the seats migration itself ran over the rows
 * `seed` wrote. `prisma db push` cannot create the partial unique indexes the seat rules rest on, so
 * every seats test gets its database from here.
 */
exports.seatsDatabase = async (seed = async () => {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'collab-seats-pg-'));
  const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const data = join(directory, 'data');
  const psql = sql => execFileSync(join(bindir, 'psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-U', userInfo().username, '-d', 'postgres'],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
  let prisma;
  const stop = async () => {
    await prisma?.$disconnect();
    try { execFileSync(join(bindir, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' }); } catch { /* never started */ }
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    execFileSync(join(bindir, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
    execFileSync(join(bindir, 'pg_ctl'), ['-D', data, '-l', join(directory, 'server.log'), '-o', `-k ${directory} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
    const url = `postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres?host=${encodeURIComponent(directory)}`;
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', resolve('prisma/schema.prisma')],
      { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await seed(prisma);
    // Back to the shape before the migration, with the seeded rows kept, then the migration as production gets it.
    psql(`DROP TABLE "AgentRun", "AgentSeat";
      ALTER TABLE "ProjectStatus" DROP COLUMN "category";
      ALTER TABLE "Project" DROP COLUMN "agentMode", DROP COLUMN "agentSwitchedAt";
      ALTER TABLE "Issue" DROP COLUMN "agentRequestRole";`);
    psql(readFileSync(resolve('prisma/migrations/20261116000100_agent_seats/migration.sql'), 'utf8'));
    return { prisma, url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
};
