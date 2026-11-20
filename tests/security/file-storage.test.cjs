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
