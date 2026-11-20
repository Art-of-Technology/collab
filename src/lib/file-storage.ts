import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Collab's own bucket: an S3-compatible store that only this server talks to.
 *
 * The store sits on a private network, so no address of it is ever handed to a browser. Bytes go in
 * and come out through this module, and each request is signed here (AWS Signature Version 4, header
 * form). Path-style addresses are used (`endpoint/bucket/key`), which every S3-compatible store accepts.
 *
 * Settings: FILE_STORAGE_ENDPOINT, FILE_STORAGE_BUCKET, FILE_STORAGE_ACCESS_KEY, FILE_STORAGE_SECRET_KEY,
 * and FILE_STORAGE_REGION (optional, `us-east-1` when absent).
 */

export type FileStorageFailure = 'not_configured' | 'write_failed' | 'read_failed';

export class FileStorageError extends Error {
  /** `uncertain`: the store did not answer or answered 5xx, so a write may have happened all the same. */
  constructor(public readonly reason: FileStorageFailure, public readonly uncertain = false) {
    super(reason);
    this.name = 'FileStorageError';
  }
}

type Settings = { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string };

function settings(): Settings | null {
  const env = process.env;
  const endpoint = env.FILE_STORAGE_ENDPOINT, bucket = env.FILE_STORAGE_BUCKET;
  const accessKey = env.FILE_STORAGE_ACCESS_KEY, secretKey = env.FILE_STORAGE_SECRET_KEY;
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKey, secretKey, region: env.FILE_STORAGE_REGION || 'us-east-1' };
}

export function fileStorageConfigured(): boolean {
  return settings() !== null;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/**
 * The headers that sign one request. `host` is part of what is signed and is left out of what is
 * returned, because the HTTP client states it itself.
 */
export function signRequest(input: {
  method: string; url: URL; headers?: Record<string, string>; payloadHash: string;
  accessKey: string; secretKey: string; region: string; now: Date;
}): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers ?? {})) headers[name.toLowerCase()] = value.trim();
  headers.host = input.url.host;
  headers['x-amz-content-sha256'] = input.payloadHash;
  headers['x-amz-date'] = amzDate;
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  // shortcut: no query string is signed, because this module never sends one; add it here before any request uses one.
  const canonicalRequest = [
    input.method, input.url.pathname, '', names.map(name => `${name}:${headers[name]}\n`).join(''), signedHeaders, input.payloadHash,
  ].join('\n');
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretKey}`, day), input.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const { host: _host, ...sent } = headers;
  return { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

// The store stops for a moment during its daily backup, so a request that finds it away is asked again.
const RETRY_WAITS_MS = [0, 500, 2000];

async function send(method: 'PUT' | 'GET' | 'DELETE', key: string, failure: FileStorageFailure, body?: Uint8Array): Promise<Response> {
  const config = settings();
  if (!config) throw new FileStorageError('not_configured');
  const url = new URL(`${config.endpoint}/${config.bucket}/${key}`);
  const payloadHash = sha256(body ?? '');
  let last: number | 'unreachable' = 'unreachable';
  for (const wait of RETRY_WAITS_MS) {
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    try {
      const response = await fetch(url, {
        method, body: body as BodyInit | undefined, redirect: 'manual',
        headers: signRequest({ method, url, payloadHash, accessKey: config.accessKey, secretKey: config.secretKey, region: config.region, now: new Date() }),
      });
      if (response.ok) return response;
      last = response.status;
      // A shared response stream can leave cancellation pending until its other reader finishes.
      void response.body?.cancel().catch(() => {});
      // Only a store that is away is worth asking again; a refusal stays a refusal.
      if (response.status < 500) break;
    } catch {
      last = 'unreachable';
    }
  }
  // Storage failures can name hosts and keys, so the log says what happened, not where.
  console.error('file_storage_request_failed', { method, status: last });
  throw new FileStorageError(failure, last === 'unreachable' || last >= 500);
}

/** Stores the bytes under a name this server makes up, and returns that name. */
export async function storeObject(prefix: string, bytes: Uint8Array): Promise<string> {
  const key = `${prefix}/${randomUUID()}`;
  try {
    await send('PUT', key, 'write_failed', bytes);
  } catch (error) {
    // The store may have kept the bytes although its answer never arrived, so they are asked back out.
    // Not waited for: the caller has its answer already. Bytes that stay are named, so they can be removed by hand.
    if (error instanceof FileStorageError && error.uncertain) {
      void removeObject(key).catch(() => console.error('file_storage_orphan_object', { object: key }));
    }
    throw error;
  }
  return key;
}

export async function openObject(key: string): Promise<ReadableStream<Uint8Array>> {
  const response = await send('GET', key, 'read_failed');
  if (!response.body) throw new FileStorageError('read_failed');
  return response.body;
}

export async function removeObject(key: string): Promise<void> {
  await send('DELETE', key, 'write_failed');
}
