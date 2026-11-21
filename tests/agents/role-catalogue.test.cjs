const { assert, test, load } = require('../security/helpers.cjs');

const askingAPerson = `Asking a person. This applies whenever your result names a person, or a comment of yours asks one for something:
- Look up everything you can first. Ask only for what only that person can decide or do.
- Do not pass on another seat's or an issue's question as you found it. Say in plain English what is being asked. An issue key or an internal name ("the waiting team", "the release tab") gets a few words saying what it is; if you could not find out what a name stands for, say that.
- Number the questions. Each one is a single decision the person can answer without opening anything, with the fact that makes it needed and your suggested answer, worded so \`yes\` accepts it. Suggesting an answer is not answering for the person: wait for their reply.
- For something the person must do by hand: how long it takes, the exact link, the label to press or the text to paste, and the reply word.
- End the ask with the one-line reply you expect, for example \`1 yes, 2 none yet\`.
- Do not ask again for something that is already asked and still open; point to that ask.`;

test('the five built-in roles have platform instructions that end with the Asking a person rule', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const roles = Array.from(ROLE_CATALOGUE.roles);
  assert.deepEqual(roles.map(role => [role.id, role.repository, role.maxPerProject]), [
    ['developer', 'yes', null], ['reviewer', 'yes', null], ['release', 'yes', 1], ['security', 'read-only', null], ['lead', 'none', 1],
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
