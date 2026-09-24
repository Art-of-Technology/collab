// Shared executable-module loader and existing regression fixtures.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = readFileSync(resolve(process.env.SECURITY_TEST_ROOT || resolve(__dirname, '../../'), file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, {
    exports,
    ...globals,
    require(name) {
      if (!(name in dependencies) && ['@/lib/issue-mutation', '@/lib/post-access', '@/lib/delete-post-comment', '@/lib/user-utils', '@/lib/notification-access', '@/lib/secrets/access', '@/lib/issue-finder', '@/lib/shared-issue-key-utils'].includes(name)) {
        return load(`src/${name.slice(2)}.ts`, dependencies, globals);
      }
      if (!(name in dependencies) && name === '@prisma/client') return require('@prisma/client');
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
      return issues.find(issue => (!where.id || issue.id === where.id) &&
        (!where.issueKey || issue.issueKey === where.issueKey) &&
        (!where.workspaceId || issue.workspaceId === where.workspaceId) &&
        (!where.workspace || matchesWorkspace(workspaces.find(w => w.id === issue.workspaceId), where.workspace))) ?? null;
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
