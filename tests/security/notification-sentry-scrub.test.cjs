// The Slack address must not reach Sentry: not in outgoing-request spans, not in the PUT body.
const { assert, load, test } = require('./helpers.cjs');

test('the Sentry configs ignore Slack requests and scrub the Slack route body', () => {
  const lib = load('src/lib/notification-sentry.ts');
  for (const [file, node] of [['sentry.server.config.ts', true], ['sentry.edge.config.ts', false]]) {
    let options;
    let fetchOptions;
    const Sentry = {
      init: (o) => { options = o; },
      nativeNodeFetchIntegration: (o) => { fetchOptions = o; return { name: 'NodeFetch' }; },
    };
    load(file, { '@sentry/nextjs': Sentry, './src/lib/notification-sentry': lib }, { process: { env: {} } });
    assert.equal(options.tracesSampleRate, 1);
    assert.equal(options.enableLogs, true);
    if (node) {
      assert.equal(options.integrations.length, 1);
      assert.equal(fetchOptions.ignoreOutgoingRequests('https://hooks.slack.com/services/T/B/x'), true);
      assert.equal(fetchOptions.ignoreOutgoingRequests('https://example.com/'), false);
    }
    for (const hook of [options.beforeSend, options.beforeSendTransaction]) {
      const slack = hook({ request: { url: 'https://app.example/api/user/notification-preferences/issues/slack', data: '{"url":"x"}' } });
      assert.equal('data' in slack.request, false);
      const other = hook({ request: { url: 'https://app.example/api/issues', data: '{"a":1}' } });
      assert.equal(other.request.data, '{"a":1}');
      assert.deepEqual(hook({}), {});
    }
  }
});
