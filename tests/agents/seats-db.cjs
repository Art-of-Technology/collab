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
    psql(execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
      '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script'], { stdio: 'pipe' }));
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await seed(prisma);
    // Back to the shape before the migration, with the seeded rows kept, then the migration as production gets it.
    psql(`DROP TABLE "AgentRoutine", "AgentRun", "AgentSeat", "AgentRunner";
      ALTER TABLE "AppToken" DROP COLUMN "runnerId";
      ALTER TABLE "ProjectStatus" DROP COLUMN "category";
      ALTER TABLE "Project" DROP COLUMN "agentMode", DROP COLUMN "agentSwitchedAt", DROP COLUMN "agentRepositoryUrl", DROP COLUMN "membersMayAddSeats";
      ALTER TABLE "Issue" DROP COLUMN "agentRequestRole";`);
    psql(readFileSync(resolve('prisma/migrations/20261116000100_agent_seats/migration.sql'), 'utf8'));
    // The seats table was made again by its own migration, so the migrations that changed it since follow.
    psql(readFileSync(resolve('prisma/migrations/20261116000400_agent_runners/migration.sql'), 'utf8'));
    psql(readFileSync(resolve('prisma/migrations/20261119000100_seat_room_and_repository/migration.sql'), 'utf8'));
    psql(`DROP TABLE "ProjectBaseline";
      ALTER TABLE "Issue" DROP COLUMN "milestoneId", DROP COLUMN "baselineStartDate", DROP COLUMN "baselineDueDate", DROP COLUMN "finishedAt";`);
    psql(readFileSync(resolve('prisma/migrations/20261120000100_project_milestones/migration.sql'), 'utf8'));
    // The remade seats table has no instructions column yet: the migration that adds it makes the role instructions table too.
    psql('DROP TABLE "AgentRoleInstructions";');
    psql(readFileSync(resolve('prisma/migrations/20261124000100_agent_role_instructions/migration.sql'), 'utf8'));
    psql('DROP TABLE "AgentPlatformPrompt";');
    psql(readFileSync(resolve('prisma/migrations/20261124000200_agent_platform_prompts/migration.sql'), 'utf8'));
    // The remade seats table has no custom role column yet either: the migration that adds it makes the custom roles table too.
    psql('DROP TABLE "AgentCustomRole";');
    psql(readFileSync(resolve('prisma/migrations/20261125000100_agent_custom_roles/migration.sql'), 'utf8'));
    psql(readFileSync(resolve('prisma/migrations/20261125000400_agent_routines/migration.sql'), 'utf8'));
    psql(readFileSync(resolve('prisma/migrations/20261126000100_seat_without_project/migration.sql'), 'utf8'));
    return { prisma, url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
};
