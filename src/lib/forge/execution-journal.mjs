import { constants } from 'node:fs';
import { open, lstat, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

const format = 'collab-ready-journal-v1';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const limit = 1024 * 1024;
const unavailable = () => new Error('Independent execution journal unavailable; reconciliation required');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

async function directory(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw unavailable();
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o077) !== 0) throw unavailable();
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function readJson(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw unavailable();
    const bytes = await handle.readFile();
    if (bytes.length > limit) throw unavailable();
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } finally { await handle.close(); }
}

async function writeNew(path, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > limit) throw unavailable();
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

// Operator-only initialization of an already mounted, empty directory. App entrypoints never initialize it.
export async function initializeExecutionJournal(path) {
  await directory(path);
  if ((await readdir(path)).length) throw unavailable();
  const authorityId = randomUUID();
  await writeNew(join(path, 'authority.json'), { format, authorityId });
  await syncDirectory(path);
  return authorityId;
}

/** @param {{origin:string, repositoryId:number, issueNumber:number, projectId:string, workspaceId:string}} target */
async function location(target) {
  const path = process.env.COLLAB_READY_JOURNAL_DIR;
  const authorityId = process.env.COLLAB_READY_JOURNAL_ID;
  if (!authorityId || !uuid.test(authorityId)) throw unavailable();
  await directory(path);
  const authority = await readJson(join(path, 'authority.json'));
  if (!exactKeys(authority, ['format', 'authorityId']) || authority.format !== format || authority.authorityId !== authorityId) throw unavailable();
  if (!exactKeys(target, ['origin', 'repositoryId', 'issueNumber', 'projectId', 'workspaceId']) ||
    !Number.isSafeInteger(target.repositoryId) || target.repositoryId < 1 ||
    !Number.isSafeInteger(target.issueNumber) || target.issueNumber < 1 ||
    [target.projectId, target.workspaceId].some(value => typeof value !== 'string' || !value || value.length > 200)) throw unavailable();
  const origin = new URL(target.origin);
  if (origin.protocol !== 'https:' || origin.origin !== target.origin) throw unavailable();
  // Same upstream issue shares a lock even if a second application binding uses different tenant IDs.
  const key = createHash('sha256').update(JSON.stringify([target.origin, target.repositoryId, target.issueNumber])).digest('hex');
  return { path, authorityId, file: join(path, `${key}.json`), lock: join(path, `${key}.lock`) };
}

async function readReceipt(place, target) {
  try {
    const envelope = await readJson(place.file);
    if (!exactKeys(envelope, ['format', 'authorityId', 'target', 'receipt']) || envelope.format !== format ||
      envelope.authorityId !== place.authorityId || !exactKeys(envelope.target, Object.keys(target)) ||
      Object.keys(target).some(key => envelope.target[key] !== target[key])) throw unavailable();
    return envelope.receipt;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** @param {{origin:string, repositoryId:number, issueNumber:number, projectId:string, workspaceId:string}} target */
export async function readExecutionJournal(target) {
  const place = await location(target);
  return { authorityId: place.authorityId, receipt: await readReceipt(place, target) };
}

/**
 * @template T
 * @param {{origin:string, repositoryId:number, issueNumber:number, projectId:string, workspaceId:string}} target
 * @param {(journal:{authorityId:string, receipt:unknown, write:(receipt:unknown)=>Promise<void>})=>Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function withExecutionJournal(target, operation) {
  const place = await location(target);
  // No stale-lock timeout or automatic removal: a crashed claimant requires independent reconciliation.
  const lock = await open(place.lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let mayUnlock = false;
  try {
    await lock.writeFile(place.authorityId);
    await lock.sync();
    await syncDirectory(place.path);
    mayUnlock = true;
    const receipt = await readReceipt(place, target);
    return await operation({ authorityId: place.authorityId, receipt, write: async next => {
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw unavailable();
      mayUnlock = false;
      const temporary = `${place.file}.${randomUUID()}.pending`;
      await writeNew(temporary, { format, authorityId: place.authorityId, target, receipt: next });
      await rename(temporary, place.file);
      await syncDirectory(place.path);
      mayUnlock = true;
    } });
  } finally {
    await lock.close();
    if (mayUnlock) { await unlink(place.lock); await syncDirectory(place.path); }
  }
}
