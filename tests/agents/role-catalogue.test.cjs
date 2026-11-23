const { assert, test, load } = require('../security/helpers.cjs');

const askingAPerson = `Asking a person. This applies whenever your result names a person, or a comment of yours asks one for something:
- Look up everything you can first. Ask only for what only that person can decide or do.
- Do not pass on another seat's or an issue's question as you found it. Say in plain English what is being asked. An issue key or an internal name ("the waiting team", "the release tab") gets a few words saying what it is; if you could not find out what a name stands for, say that.
- Number the questions. Each one is a single decision the person can answer without opening anything, with the fact that makes it needed and your suggested answer, worded so \`yes\` accepts it. Suggesting an answer is not answering for the person: wait for their reply.
- For something the person must do by hand: how long it takes, the exact link, the label to press or the text to paste, and the reply word.
- End the ask with the one-line reply you expect, for example \`1 yes, 2 none yet\`.
- Do not ask again for something that is already asked and still open; point to that ask.`;

test('the built-in roles have platform instructions that end with the Asking a person rule', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const roles = Array.from(ROLE_CATALOGUE.roles);
  assert.deepEqual(roles.map(role => [role.id, role.repository, role.maxPerProject]), [
    ['developer', 'yes', null], ['reviewer', 'yes', null], ['release', 'yes', 1], ['security', 'read-only', null], ['lead', 'none', 1], ['planner', 'read-only', null],
  ]);
  for (const role of roles) {
    assert.ok(role.platformPrompt.endsWith(askingAPerson), role.id);
    assert.ok(role.platformPrompt.slice(0, -askingAPerson.length).trim(), role.id);
  }
  assert.equal(ROLE_CATALOGUE.getRole('developer').platformPrompt, ROLE_CATALOGUE.getRole('reviewer').platformPrompt);
  assert.equal(ROLE_CATALOGUE.getRole('developer').platformPrompt, ROLE_CATALOGUE.getRole('release').platformPrompt);
  assert.match(ROLE_CATALOGUE.getRole('lead').platformPrompt, /Decide which|You decide which/);
  assert.match(ROLE_CATALOGUE.getRole('security').platformPrompt, /verdict/);
});

test('the Planner takes ordinary issues, reads its project\'s repository and grills in rounds before it files anything', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const planner = ROLE_CATALOGUE.getRole('planner');
  assert.equal(planner.name, 'Planner');
  // Its grilling sessions are ordinary issues assigned to it; no request kind reaches it yet.
  assert.deepEqual(Array.from(planner.issueKinds), [null]);
  assert.deepEqual(Array.from(planner.requests), []);
  assert.equal(ROLE_CATALOGUE.requests.some(request => request.seat === 'planner'), false);
  const own = planner.platformPrompt.slice(0, -askingAPerson.length);
  // Short enough to read in a minute.
  assert.ok(own.split(/\s+/).filter(Boolean).length <= 280, `${own.split(/\s+/).length} words`);
  // Rounds of the whole frontier, one thread per question, each with a topic and an answer "yes" accepts.
  assert.match(own, /round/i);
  assert.match(own, /frontier/i);
  assert.match(own, /--parent-id/);
  assert.match(own, /topic/i);
  assert.match(own, /`yes`/);
  // Facts are found by reading, not asked.
  assert.match(own, /repository/);
  assert.match(own, /Context/);
  // Settled: Decisions and Plan; issues only after approval, from the templates and the project note, unassigned.
  assert.match(own, /Decisions/);
  assert.match(own, /Plan/);
  assert.match(own, /approv/i);
  assert.match(own, /collab templates/);
  assert.match(own, /cmwqb5dvy00ioqq011y0vr3zd/);
  assert.match(own, /unassigned/i);
  // What it never does.
  assert.match(own, /never/i);
  assert.match(own, /pull request/);
  // The method's source and licence.
  assert.match(own, /mattpocock\/skills/);
  assert.match(own, /MIT/);
});
