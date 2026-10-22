// Shared executable-module loader and existing regression fixtures.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  dependencies = { ...dependencies };
  if (file === 'src/lib/permissions.ts') {
    dependencies['server-only'] = {};
    dependencies['./permission-types'] = load('src/lib/permission-types.ts');
  }
  const exports = {};
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../'), file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, {
    exports,
    ...globals,
    require(name) {
      if (!(name in dependencies) && ['@/lib/issue-trash', '@/lib/issue-trash-response', '@/lib/issue-trash-browser'].includes(name)) {
        // Keep error classes shared while exercising the actual lifecycle. A fixture must
        // supply every database operation and event needed by the path it invokes.
        const database = dependencies['@/lib/prisma'] || {};
        const trashDependencies = { ...dependencies, 'server-only': {},
          '@/lib/prisma': { ...database, issueTrashPrisma: database.issueTrashPrisma || database.prisma },
        };
        trashDependencies['@/lib/permissions'] ||= load('src/lib/permissions.ts', { './prisma': database }, globals);
        const unexpectedEvent = () => { throw new Error('Unexpected issue lifecycle event; provide a fixture'); };
        trashDependencies['@/lib/event-bus'] ||= { emitIssueCreated: unexpectedEvent, emitIssueDeleted: unexpectedEvent };
        dependencies['@/lib/forge/legacy-write-guard'] ||= load('src/lib/forge/legacy-write-guard.ts', {
          './reader': { readForgeBindings: async () => [] }, ...trashDependencies,
        }, globals);
        trashDependencies['@/lib/forge/legacy-write-guard'] = dependencies['@/lib/forge/legacy-write-guard'];
        dependencies['@/lib/issue-trash'] ||= load('src/lib/issue-trash.ts', trashDependencies, globals);
        if (!(name in dependencies)) dependencies[name] = load(`src/${name.slice(2)}.ts`, dependencies, globals);
        return dependencies[name];
      }
      if (!(name in dependencies) && name === '@/lib/forge/legacy-write-guard') {
        return load('src/lib/forge/legacy-write-guard.ts', {
          'server-only': {}, './reader': { readForgeBindings: async () => [] },
          ...dependencies,
          '@/lib/prisma': { ...dependencies['@/lib/prisma'], issueTrashPrisma: dependencies['@/lib/prisma']?.issueTrashPrisma || dependencies['@/lib/prisma']?.prisma },
        }, globals);
      }
      if (!(name in dependencies) && name === '@/lib/request-session') {
        // Existing tenant fixtures exercise the real adapter in explicit legacy mode.
        const legacyGlobals = { ...globals, process: { env: { COLLAB_AUTH_MODE: 'nextauth' } }, Buffer, TextDecoder, URL };
        return load('src/lib/request-session.ts', { ...dependencies, 'server-only': {},
          './gateway-identity': load('src/lib/gateway-identity.ts', { 'node:crypto': require('node:crypto') }, legacyGlobals),
          'next/headers': { headers() { throw new Error('Unexpected gateway header read in legacy fixture'); } },
        }, legacyGlobals);
      }
      if (!(name in dependencies) && ['@/lib/issue-key-allocation', '@/lib/note-tag-access', '@/lib/issue-mutation', '@/lib/post-access', '@/lib/delete-post-comment', '@/lib/user-utils', '@/lib/notification-access', '@/lib/secrets/access', '@/lib/issue-finder', '@/lib/shared-issue-key-utils'].includes(name)) {
        return load(`src/${name.slice(2)}.ts`, dependencies, globals);
      }
      if (!(name in dependencies) && name === '@/lib/agent-label-triggers') return load('src/lib/agent-label-triggers.ts', { 'node:crypto': require('node:crypto') });
      if (!(name in dependencies) && name === '@prisma/client') return require('@prisma/client');
      if (!(name in dependencies) && name === '@/lib/avatar-settings') return load('src/lib/avatar-settings.ts', { ...dependencies, zod: require('zod') }, globals);
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => matches(row, clause));
    if (key === 'OR') return value.some(clause => matches(row, clause));
    if (key === 'NOT') return !matches(row, value);
    const actual = row?.[key];
    if (value === undefined) return true;
    if (value === null || typeof value !== 'object') return actual === value;
    if (Object.prototype.toString.call(value) === '[object Date]') return actual?.getTime() === value.getTime();
    if ('some' in value) return actual?.some(item => matches(item, value.some)) ?? false;
    if ('in' in value) return value.in.includes(actual);
    if ('notIn' in value) return !value.notIn.includes(actual);
    if ('not' in value) return actual !== value.not;
    if ('contains' in value) return typeof actual === 'string' && actual.toLowerCase().includes(value.contains.toLowerCase());
    if ('gte' in value) return actual != null && actual >= value.gte;
    if ('lt' in value) return actual != null && actual < value.lt;
    return actual != null && matches(actual, value);
  });
}

const workspaces = [
  { id: 'own', ownerId: 'alice', members: [] },
  { id: 'joined', ownerId: 'bob', members: [{ userId: 'alice', status: true }] },
  { id: 'revoked', ownerId: 'bob', members: [{ userId: 'alice', status: false }] },
  { id: 'foreign', ownerId: 'bob', members: [] },
];
const issues = workspaces.map(workspace => ({
  id: `id-${workspace.id}`, issueKey: `${workspace.id.toUpperCase()}-1`, workspaceId: workspace.id,
  workspace, project: { workspace }, statusId: null,
}));

// Evaluate the Prisma predicates against records, including absent predicates.
function matchesWorkspace(workspace, where) {
  return (!where.id || where.id === workspace.id) && (!where.OR || where.OR.some(clause => {
    if ('ownerId' in clause) return workspace.ownerId === clause.ownerId;
    const member = clause.members.some;
    return workspace.members.some(row => row.userId === member.userId &&
      (member.status === undefined || row.status === member.status));
  }));
}
const prisma = {
  issue: {
    async findFirst({ where }) {
      return issues.find(issue => matches(issue, where)) ?? null;
    },
    async findUnique({ where }) { return issues.find(issue => issue.id === where.id) ?? null; },
  },
  workspace: {
    async findFirst({ where }) { return workspaces.find(workspace => matchesWorkspace(workspace, where)) ?? null; },
  },
};
const { findIssueByIdOrKey, userHasWorkspaceAccess } = load('src/lib/issue-finder.ts', {
  '@/lib/prisma': { prisma },
  '@/lib/shared-issue-key-utils': load('src/lib/shared-issue-key-utils.ts'),
});

const enums = {
  NoteScope: Object.fromEntries(['PERSONAL', 'PROJECT', 'WORKSPACE', 'PUBLIC', 'SHARED'].map(v => [v, v])),
  NoteSharePermission: { EDIT: 'EDIT', VIEW: 'VIEW' },
  NoteActivityAction: {},
};
const { checkNoteAccess } = load('src/lib/secrets/access.ts', {
  '@/lib/prisma': { prisma }, '@prisma/client': enums, '@/lib/issue-finder': { userHasWorkspaceAccess },
});
const note = {
  id: 'note', authorId: 'bob', scope: 'WORKSPACE', workspaceId: 'joined', projectId: null,
  isRestricted: false, isEncrypted: true, expiresAt: null, sharedWith: [],
};
module.exports = { assert, test, readFileSync, resolve, runInNewContext, ts, load, matches, workspaces, issues, matchesWorkspace, prisma, findIssueByIdOrKey, userHasWorkspaceAccess, enums, checkNoteAccess, note };
