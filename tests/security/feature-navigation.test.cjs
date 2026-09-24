const { assert, test, load } = require('./helpers.cjs');

for (const projectScoped of [false, true]) {
  test(`feature navigation preserves ${projectScoped ? 'project' : 'workspace'} not-found, success and fetch errors`, async (t) => {
    const session = { user: { id: 'alice', email: 'alice@example.test' } };
    let feature = null;
    let fetchError;
    const logged = [];
    const { default: Page } = load(
      `src/app/(main)/[workspaceId]/${projectScoped ? 'projects/[projectSlug]/' : ''}features/[id]/page.tsx`,
      {
        'next/navigation': require('next/navigation'),
        'react/jsx-runtime': require('react/jsx-runtime'),
        'next/link': { default: 'a' },
        'lucide-react': { ChevronLeft: 'span' },
        'next-auth': { getServerSession: async () => session },
        '@/lib/auth': { getAuthSession: async () => session, authConfig: {} },
        '@/lib/slug-resolvers': { resolveWorkspaceSlug: async () => 'workspace-id' },
        '@/lib/prisma': { prisma: {
          workspace: { findFirst: async () => ({ id: 'workspace-id' }) },
          project: { findFirst: async () => ({ id: 'project-id', name: 'Project' }) },
          user: { findUnique: async () => session.user },
        } },
        '@/components/ui/button': { Button: 'button' },
        '@/components/features/FeatureRequestDetail': { default: 'section' },
        '@/components/features/FeatureRequestComments': { default: 'aside' },
        '@/actions/feature': { getFeatureRequestById: async () => {
          if (fetchError) throw fetchError;
          return feature;
        } },
      },
      { console: { error: (...args) => logged.push(args) } },
    );
    const render = () => Page({ params: Promise.resolve({
      workspaceId: 'workspace-slug', projectSlug: 'project-slug', id: 'feature-id',
    }) });
    const { isHTTPAccessFallbackError, getAccessFallbackHTTPStatus } =
      require('next/dist/client/components/http-access-fallback/http-access-fallback');
    await t.test('missing feature reaches the 404 boundary', async () => {
      await assert.rejects(render, error =>
        isHTTPAccessFallbackError(error) && getAccessFallbackHTTPStatus(error) === 404);
      assert.equal(logged.length, 0, 'not-found is navigation, not a fetch failure');
    });
    logged.length = 0;

    feature = { id: 'feature-id', projectId: 'project-id', comments: [], userVote: null, isAdmin: false };
    assert.equal((await render()).props.children[1].props.children[0].props.featureRequest, feature);
    assert.equal(logged.length, 0);

    if (projectScoped) {
      feature.projectId = 'other-project';
      const { getURLFromRedirectError } = require('next/dist/client/components/redirect');
      await t.test('foreign project redirects to the project feature list', async () => {
        await assert.rejects(render, error =>
          getURLFromRedirectError(error) === '/workspace-slug/projects/project-slug/features');
        assert.equal(logged.length, 0, 'project redirect is not a fetch failure');
      });
      logged.length = 0;
    }

    fetchError = new Error('Database unavailable');
    assert.equal((await render()).props.children, 'Something went wrong');
    assert.equal(logged.length, 1);
    assert.equal(logged[0][1], fetchError);
  });
}

