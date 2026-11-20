const { assert, test, load } = require('./helpers.cjs');

// Collab's own bucket: requests are signed the way an S3-compatible store checks them.
const { signRequest } = load('src/lib/file-storage.ts', { 'node:crypto': require('node:crypto') }, { URL, console, process: { env: {} } });

test('a request is signed as Signature Version 4 says, checked against the published example', () => {
  // "GET Object" from the Amazon S3 API reference, Signature Version 4, signing with the Authorization header.
  const headers = signRequest({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { Range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
    + 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, '
    + 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.equal(headers['x-amz-date'], '20130524T000000Z');
  // The HTTP client states the host itself, so it is signed and not sent twice.
  assert.equal('host' in headers, false);
});

test('bucket redirects fail without following for every operation', async () => {
  const requests = [];
  const storage = load('src/lib/file-storage.ts', { 'node:crypto': require('node:crypto') }, {
    URL, console: { error() {} }, process: { env: { FILE_STORAGE_ENDPOINT: 'https://s3.test', FILE_STORAGE_BUCKET: 'bucket', FILE_STORAGE_ACCESS_KEY: 'key', FILE_STORAGE_SECRET_KEY: 'secret' } },
    fetch: async (url, options) => {
      requests.push(options);
      return options.redirect === 'manual' ? new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } }) : new Response('followed');
    },
  });
  for (const call of [() => storage.storeObject('context', Buffer.from('x')), () => storage.openObject('context/key'), () => storage.removeObject('context/key')]) {
    await assert.rejects(call);
  }
  assert.deepEqual(requests.map(request => request.method), ['PUT', 'GET', 'DELETE']);
});

test('a refused read returns even when cancelling a shared response stream is pending', async () => {
  const storage = load('src/lib/file-storage.ts', { 'node:crypto': require('node:crypto') }, {
    URL, console: { error() {} }, process: { env: { FILE_STORAGE_ENDPOINT: 'https://s3.test', FILE_STORAGE_BUCKET: 'bucket', FILE_STORAGE_ACCESS_KEY: 'key', FILE_STORAGE_SECRET_KEY: 'secret' } },
    fetch: async () => {
      const response = new Response('refused', { status: 403 });
      response.clone(); // A second reader can keep cancellation of the first branch pending.
      return response;
    },
  });
  let timer;
  try {
    await assert.rejects(Promise.race([
      storage.openObject('context/key'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('read did not finish')), 1000); }),
    ]), error => error.reason === 'read_failed');
  } finally { clearTimeout(timer); }
});

test('a write whose answer never arrives is asked back out, and bytes that stay are named', async () => {
  const requests = [], logged = [];
  const state = { deleteWorks: true };
  const storage = load('src/lib/file-storage.ts', { 'node:crypto': require('node:crypto') }, {
    URL, setTimeout, console: { error: (...line) => logged.push(line) },
    process: { env: { FILE_STORAGE_ENDPOINT: 'https://s3.test', FILE_STORAGE_BUCKET: 'bucket', FILE_STORAGE_ACCESS_KEY: 'key', FILE_STORAGE_SECRET_KEY: 'secret' } },
    fetch: async (url, { method }) => {
      requests.push(`${method} ${new URL(url).pathname}`);
      if (method === 'PUT') throw new Error('connection reset');
      return new Response(null, { status: state.deleteWorks ? 204 : 403 });
    },
  });
  const settled = async () => { for (let i = 0; i < 20 && !requests.some(line => line.startsWith('DELETE')); i++) await new Promise(resolve => setTimeout(resolve, 10)); };

  await assert.rejects(storage.storeObject('context', Buffer.from('bytes')), error => error.reason === 'write_failed' && error.uncertain === true);
  await settled();
  const object = requests[0].replace('PUT /bucket/', '');
  assert.match(object, /^context\/[0-9a-f-]{36}$/);
  assert.deepEqual(requests, [`PUT /bucket/${object}`, `PUT /bucket/${object}`, `PUT /bucket/${object}`, `DELETE /bucket/${object}`]);
  assert.equal(logged.some(line => line[0] === 'file_storage_orphan_object'), false);

  // When the bytes cannot be asked back out either, the log names them and nothing else about the store.
  requests.length = 0; logged.length = 0; state.deleteWorks = false;
  await assert.rejects(storage.storeObject('context', Buffer.from('bytes')));
  await settled();
  await new Promise(resolve => setTimeout(resolve, 20));
  const orphan = logged.find(line => line[0] === 'file_storage_orphan_object');
  assert.deepEqual(Object.keys(orphan[1]), ['object']);
  assert.equal(JSON.stringify(logged).includes('s3.test'), false);
});

test('a refused write is not followed by a delete: nothing was stored', async () => {
  const requests = [];
  const storage = load('src/lib/file-storage.ts', { 'node:crypto': require('node:crypto') }, {
    URL, setTimeout, console: { error() {} },
    process: { env: { FILE_STORAGE_ENDPOINT: 'https://s3.test', FILE_STORAGE_BUCKET: 'bucket', FILE_STORAGE_ACCESS_KEY: 'key', FILE_STORAGE_SECRET_KEY: 'secret' } },
    fetch: async (url, { method }) => { requests.push(method); return new Response(null, { status: 403 }); },
  });
  await assert.rejects(storage.storeObject('context', Buffer.from('bytes')), error => error.reason === 'write_failed' && error.uncertain === false);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(requests, ['PUT']);
});
