const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const block = (schema.match(/^model IssueNotificationSetting \{[\s\S]*?^\}/m) || [''])[0];

test('every choice is off by default', () => {
  assert.ok(block, 'the model is in the schema');
  for (const field of ['slackOn', 'slackEverOn', 'mineAssigned', 'mineReported', 'mineFollowed', 'onStatus', 'onAssigned', 'onReactions']) {
    assert.match(block, new RegExp(`^\\s+${field}\\s+Boolean\\s+@default\\(false\\)`, 'm'), `${field} is off by default`);
  }
  assert.match(block, /^\s+comments\s+String\s+@default\("off"\)/m);
});

test('one row per person per workspace', () => {
  assert.ok(block, 'the model is in the schema');
  assert.match(block, /@@unique\(\[userId, workspaceId\]\)/);
  assert.match(block, /user\s+User\s+@relation\([^)]*onDelete: Cascade\)/);
  assert.match(block, /workspace\s+Workspace\s+@relation\([^)]*onDelete: Cascade\)/);
});

test('the migration only adds', () => {
  const sql = fs.readFileSync(path.join(root, 'prisma/migrations/20261127000100_issue_notification_settings/migration.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE "IssueNotificationSetting"/);
  const statements = sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) {
    assert.ok(
      statement.startsWith('CREATE TABLE "IssueNotificationSetting"') ||
        /^CREATE (UNIQUE )?INDEX /.test(statement) ||
        statement.startsWith('ALTER TABLE "IssueNotificationSetting" ADD CONSTRAINT'),
      `unexpected statement: ${statement.slice(0, 80)}`,
    );
  }
  assert.doesNotMatch(sql, /\bDROP\b/i);
  const tables = [...sql.matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]);
  const referenced = [...sql.matchAll(/REFERENCES "([A-Za-z]+)"/g)].map(m => m[1]);
  assert.deepEqual([...new Set(referenced)].sort(), ['User', 'Workspace']);
  for (const statement of statements.filter(s => /^CREATE (UNIQUE )?INDEX /.test(s))) {
    assert.match(statement, / ON "IssueNotificationSetting"\(/);
  }
  assert.ok(tables.length > 0);
});
