const { test, assert, load } = require('./helpers.cjs');

const next = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
const ROLES = ['SYSTEM_ADMIN', 'DEVELOPER', 'PROJECT_MANAGER', 'HR', 'LEGAL', 'FINANCE', 'MARKETING', 'SALES'];

// A database that keeps users the way the schema does: `role` defaults to DEVELOPER and must be a UserRole.
function fixture({ users = [] } = {}) {
  const created = [];
  const prisma = { user: {
    findUnique: async ({ where }) => users.find(user => user.email === where.email) || null,
    create: async ({ data, select }) => {
      if (data.role !== undefined && !ROLES.includes(data.role)) throw new Error('Invalid value for argument `role`');
      const row = { id: `user-${created.length + 1}`, role: 'DEVELOPER', image: null, createdAt: new Date(0), ...data };
      created.push(row); users.push(row);
      return select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row;
    },
  } };
  const route = load('src/app/api/register/route.ts', {
    'next/server': next,
    '@/lib/gateway-identity': { authMode: () => 'nextauth' },
    bcrypt: { hash: async password => `hashed:${password}` },
    '@/lib/prisma': { prisma },
    '@/lib/avatar-generator': { generateRandomAvatar: () => ({}) },
  }, { console: { log() {}, error() {} } });
  return { register: body => route.POST({ json: async () => body }), created };
}

test('a role in the request body is ignored and the account gets the schema default', async () => {
  for (const role of ['SYSTEM_ADMIN', 'PROJECT_MANAGER', undefined]) {
    const f = fixture();
    const response = await f.register({ name: 'Mallory', email: 'm@example.test', password: 'secret', role });
    assert.equal(response.status, 200, `role ${role}`);
    assert.equal(f.created.length, 1);
    assert.equal(f.created[0].role, 'DEVELOPER');
  }
});

test('the answer carries the id, name and email and no password hash', async () => {
  const f = fixture();
  const response = await f.register({ name: 'Ada', email: 'ada@example.test', password: 'secret', role: 'SYSTEM_ADMIN' });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), { id: 'user-1', name: 'Ada', email: 'ada@example.test' });
  assert.doesNotMatch(JSON.stringify(response.body), /hashed:|secret/);
  assert.equal(f.created[0].hashedPassword, 'hashed:secret');
});

test('a taken email and a missing field are still refused', async () => {
  const f = fixture({ users: [{ id: 'old', email: 'taken@example.test' }] });
  const taken = await f.register({ name: 'Ada', email: 'taken@example.test', password: 'secret' });
  assert.equal(taken.status, 400);
  assert.equal(taken.body.message, 'Email already registered');
  for (const missing of ['name', 'email', 'password']) {
    const body = { name: 'Ada', email: 'new@example.test', password: 'secret' };
    delete body[missing];
    const response = await f.register(body);
    assert.equal(response.status, 400, `missing ${missing}`);
    assert.equal(response.body.message, 'Missing required fields');
  }
  assert.equal(f.created.length, 0);
});
