const assert = require('node:assert/strict');

/**
 * The workspace monitor asks the database one question for all agents instead of one per agent.
 * Whatever state a test leaves behind, the monitor must list exactly what the agents' own inboxes
 * hold, in the same order, for a viewer who may read every issue of the workspace.
 */
exports.monitorAgreesWithInboxes = async ({ prisma, service, context, viewer, workspaceId = 'w' }) => {
  const agents = await prisma.agentRegistration.findMany({ where: { workspaceId } });
  for (const state of ['unseen', 'claimed']) {
    const own = new Map();
    for (const agent of agents) {
      for (let cursor; ;) {
        const page = await service.agentInbox(context(agent.userId, workspaceId),
          service.inboxSchema.parse({ agent: agent.name, state, limit: 50, ...(cursor && { cursor }) }));
        for (const row of page.items) own.set(row.id, row.createdAt);
        if (!(cursor = page.nextCursor)) break;
      }
      // Asking the monitor about one agent gives that agent's inbox.
      const one = await service.workspaceAgentInbox(viewer, { state, agent: agent.name, limit: 50 });
      const first = await service.agentInbox(context(agent.userId, workspaceId), service.inboxSchema.parse({ agent: agent.name, state, limit: 50 }));
      assert.deepEqual(Array.from(one.items, row => row.id), Array.from(first.items, row => row.id), `monitor for ${agent.name} agrees with its inbox (${state})`);
    }
    const expected = [...own].sort(([a, at], [b, bt]) => at - bt || (a < b ? -1 : 1)).map(([id]) => id);
    const monitor = await service.workspaceAgentInbox(viewer, { state, limit: 50 });
    assert.deepEqual(Array.from(monitor.items, row => row.id), expected.slice(0, 50), `monitor and agent inboxes agree (${state})`);
    assert.equal(monitor.hasMore, expected.length > 50, `monitor knows whether more follows (${state})`);
  }
};
