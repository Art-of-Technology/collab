const { assert, test, load } = require('../security/helpers.cjs');

// The shared part every role's prompt ends with, from its heading on.
const sharedPart = prompt => prompt.slice(prompt.indexOf('\n\nAsking a person.') + 2);

test('the built-in roles have platform instructions that end with the Asking a person rule', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const roles = Array.from(ROLE_CATALOGUE.roles);
  assert.deepEqual(roles.map(role => [role.id, role.repository, role.maxPerProject]), [
    ['developer', 'yes', null], ['reviewer', 'yes', null], ['release', 'yes', 1], ['security', 'read-only', null], ['lead', 'none', 1], ['planner', 'read-only', null],
    ['docs', 'yes', null], ['changelog', 'yes', null], ['architect', 'read-only', null],
  ]);
  const askingAPerson = sharedPart(roles[0].platformPrompt);
  assert.match(askingAPerson, /^Asking a person\./);
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
  const own = planner.platformPrompt.slice(0, -sharedPart(planner.platformPrompt).length);
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
  // Found by its title, so the prompt names no one workspace's note id.
  assert.match(own, /collab notes list --search "Plan to issues"/);
  assert.doesNotMatch(own, /cmwqb5dvy00ioqq011y0vr3zd/);
  assert.match(own, /unassigned/i);
  // What it never does.
  assert.match(own, /never/i);
  assert.match(own, /pull request/);
  // The method's source and licence.
  assert.match(own, /mattpocock\/skills/);
  assert.match(own, /MIT/);
});

test('the Documentation Manager takes docs requests and gets a short docs-only platform prompt', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const role = ROLE_CATALOGUE.getRole('docs');
  assert.ok(role, 'the catalogue has a Documentation Manager role');
  assert.equal(role.name, 'Documentation Manager');
  assert.equal(role.repository, 'yes');
  assert.deepEqual(Array.from(role.issueKinds), ['docs']);
  assert.deepEqual({ ...ROLE_CATALOGUE.getRequest('docs') }, { id: 'docs', label: 'Docs request', seat: role.id });

  const [platform] = ROLE_CATALOGUE.instructionLayers(role.id, { ownerId: null });
  assert.equal(platform.layer, 'platform');
  assert.equal(platform.text, role.platformPrompt);
  assert.ok(platform.text.slice(0, -sharedPart(platform.text).length).split(/\s+/).length <= 280);
  assert.match(platform.text, /update the docs pages .* change touches/i);
  assert.match(platform.text, /picture or table first.*short steps.*detail at the end/i);
  assert.match(platform.text, /open a pull request/i);
  assert.match(platform.text, /never change product code/i);
  assert.match(platform.text, /finish as `done`/i);
  assert.match(platform.text, /finish as `blocked` with `blockedBy`.*`askedUser`/i);
});

test('the Changelog Manager takes changelog requests and gets a short draft-only platform prompt', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const role = ROLE_CATALOGUE.getRole('changelog');
  assert.ok(role, 'the catalogue has a Changelog Manager role');
  assert.equal(role.name, 'Changelog Manager');
  assert.equal(role.repository, 'yes');
  assert.deepEqual(Array.from(role.issueKinds), ['changelog']);
  assert.deepEqual({ ...ROLE_CATALOGUE.getRequest('changelog') }, { id: 'changelog', label: 'Changelog request', seat: role.id });

  const [platform] = ROLE_CATALOGUE.instructionLayers(role.id, { ownerId: null });
  assert.equal(platform.layer, 'platform');
  assert.equal(platform.text, role.platformPrompt);
  assert.ok(platform.text.slice(0, -sharedPart(platform.text).length).split(/\s+/).length <= 280);
  assert.match(platform.text, /draft .*entry for what was released/i);
  assert.match(platform.text, /plain words a customer understands/i);
  assert.match(platform.text, /hand the draft to a person/i);
  assert.match(platform.text, /never publish/i);
});

test('the Software Architect takes design requests and gets a short read-only platform prompt', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const role = ROLE_CATALOGUE.getRole('architect');
  assert.ok(role, 'the catalogue has a Software Architect role');
  assert.equal(role.name, 'Software Architect');
  assert.equal(role.repository, 'read-only');
  assert.deepEqual(Array.from(role.issueKinds), ['design']);
  assert.deepEqual({ ...ROLE_CATALOGUE.getRequest('design') }, { id: 'design', label: 'Design request', seat: role.id });

  const [platform] = ROLE_CATALOGUE.instructionLayers(role.id, { ownerId: null });
  assert.equal(platform.layer, 'platform');
  assert.equal(platform.text, role.platformPrompt);
  assert.ok(platform.text.slice(0, -sharedPart(platform.text).length).split(/\s+/).length <= 280);
  assert.match(platform.text, /read the repository/i);
  assert.match(platform.text, /design note/i);
  assert.match(platform.text, /diagram/i);
  assert.match(platform.text, /trade-offs/i);
  assert.match(platform.text, /simplest option that works/i);
  assert.match(platform.text, /post the full design as a comment on the design request/i);
  assert.match(platform.text, /link it in your `done` result/i);
  assert.match(platform.text, /a person saves it as a project note in Context/i);
  assert.match(platform.text, /if blocked, finish `blocked` with `blockedBy`.*`askedUser`/i);
  assert.match(platform.text, /never change code.*commit.*push.*open a pull request.*create a Context note/i);
});

test('a run\'s instructions are three layers in order, platform, organisation and seat, or four with a custom role\'s, each with a stated maximum length', () => {
  const { ROLE_CATALOGUE, LAYER_LIMITS } = load('src/lib/agent-role-catalogue.ts');
  // Plain values of this test's own realm, so they compare as such.
  const instructionLayers = (...args) => JSON.parse(JSON.stringify(ROLE_CATALOGUE.instructionLayers(...args)));
  assert.deepEqual({ ...LAYER_LIMITS }, { platform: 8000, organisation: 16000, role: 16000, seat: 16000 });
  for (const role of ROLE_CATALOGUE.roles) {
    const layers = instructionLayers(role.id, { ownerId: 'cowner00001' });
    assert.deepEqual(layers.map(layer => layer.layer), ['platform', 'organisation', 'seat'], role.id);
    // The owner's id stands where the prompt names the person to ask; nothing is left for the runner to fill in.
    assert.equal(layers[0].text, role.platformPrompt.replaceAll('{{ownerId}}', 'cowner00001'), role.id);
    assert.doesNotMatch(layers[0].text, /\{\{/, role.id);
    assert.ok(layers[0].text.length <= LAYER_LIMITS.platform, role.id);
    // Nothing is stored for the organisation or the seat yet: those layers are present and empty.
    assert.deepEqual(layers.slice(1).map(layer => layer.text), ['', ''], role.id);
  }
  assert.match(instructionLayers('developer', { ownerId: 'cowner00001' })[0].text, /`askedUser` set to cowner00001\./);
  // A seat with no owner is not told to ask an id that does not exist.
  assert.doesNotMatch(instructionLayers('developer', { ownerId: null })[0].text, /\{\{|null/);
  // The texts saved for the later layers come after the platform's, in order.
  assert.deepEqual(instructionLayers('reviewer', { ownerId: null, organisation: 'Our rules.', seat: 'This seat\'s rules.' }).slice(1),
    [{ layer: 'organisation', text: 'Our rules.' }, { layer: 'seat', text: 'This seat\'s rules.' }]);
  // A seat with the organisation's own role (CLB-626) gets that role's text as a fourth layer, before the seat's; empty text is still a layer.
  assert.deepEqual(instructionLayers('developer', { ownerId: null, organisation: 'Our rules.', customRole: 'QA rules.', seat: 'This seat\'s rules.' }).map(layer => [layer.layer, layer.text]).slice(1),
    [['organisation', 'Our rules.'], ['role', 'QA rules.'], ['seat', 'This seat\'s rules.']]);
  assert.deepEqual(instructionLayers('developer', { ownerId: null, customRole: '' }).map(layer => layer.layer), ['platform', 'organisation', 'role', 'seat']);
  // An issue that no seat works has no role: every layer is present and empty.
  assert.deepEqual(instructionLayers(null, { ownerId: null }), [{ layer: 'platform', text: '' }, { layer: 'organisation', text: '' }, { layer: 'seat', text: '' }]);
  assert.deepEqual(instructionLayers('no-such-role', { ownerId: null }).map(layer => layer.text), ['', '', '']);
  // A role added as one entry has its layers with no other change.
  const { extendedCatalogue } = require('./role-catalogue-fixture.cjs');
  assert.equal(extendedCatalogue().ROLE_CATALOGUE.instructionLayers('mapper', { ownerId: null })[0].text, extendedCatalogue().ROLE_CATALOGUE.getRole('mapper').platformPrompt);
});

test('a layer longer than its maximum is refused when it is saved', () => {
  const { ROLE_ENTRIES, LAYER_LIMITS, createRoleCatalogue, layerText } = load('src/lib/agent-role-catalogue.ts');
  const { extraRole } = require('./role-catalogue-fixture.cjs');
  // The platform layer is saved in the repository: a catalogue with a platform prompt over the limit does not load.
  const asking = createRoleCatalogue([extraRole]).getRole('mapper').platformPrompt.length - extraRole.platformPrompt.length;
  const fits = { ...extraRole, platformPrompt: 'x'.repeat(LAYER_LIMITS.platform - asking) };
  assert.equal(createRoleCatalogue([...ROLE_ENTRIES, fits]).getRole('mapper').platformPrompt.length, LAYER_LIMITS.platform);
  assert.throws(() => createRoleCatalogue([...ROLE_ENTRIES, { ...fits, platformPrompt: `${fits.platformPrompt}x` }]), /mapper.*8000/);
  // The organisation's and the seat's are checked by the function the pages that save them call.
  for (const layer of ['organisation', 'seat']) {
    assert.equal(layerText(layer, '   '), '');
    assert.equal(layerText(layer, `  ${'y'.repeat(LAYER_LIMITS[layer])}  `).length, LAYER_LIMITS[layer]);
    assert.throws(() => layerText(layer, 'y'.repeat(LAYER_LIMITS[layer] + 1)), new RegExp(`${layer}.*${LAYER_LIMITS[layer]}`));
  }
});

test('the shared part keeps its asking rules and says how a seat declares a stop, never asks whether to continue, and waits with a limit (CLB-1227)', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const shared = sharedPart(ROLE_CATALOGUE.getRole('developer').platformPrompt);
  // What it said before.
  assert.match(shared, /Look up everything you can first/);
  assert.match(shared, /Do not pass on another seat's or an issue's question as you found it/);
  assert.match(shared, /Number the questions.*worded so `yes` accepts it.*wait for their reply/);
  assert.match(shared, /must do by hand: how long it takes, the exact link/);
  assert.match(shared, /one-line reply you expect/);
  assert.match(shared, /Do not ask again for something that is already asked and still open/);
  // 1. A finish that names a person declares a Decision or Your hands, with an example of each that the server takes.
  assert.match(shared, /When you finish naming a person, declare what you ask with `collab run finish --ask-file FILE`/);
  assert.match(shared, /a Decision \(one to five questions, each with two to four short reply words without a slash, and the one you suggest\)/);
  assert.match(shared, /Your hands \(the steps, and the one word that says they are done\)/);
  const examples = [...shared.matchAll(/`(\{"kind".*?\})`/g)].map(match => JSON.parse(match[1]));
  assert.deepEqual(examples.map(example => example.kind), ['decision', 'hands']);
  assert.ok(examples[0].questions[0].options.every(option => option.length <= 40 && !option.includes('/')));
  assert.ok(examples[1].steps && examples[1].doneWord);
  // 2. A seat whose CLI lacks the option finishes as before.
  assert.match(shared, /First run `collab --version`: if it is below 0\.17\.0, or `collab run finish` refuses `--ask-file` as an unknown flag, finish without `--ask-file`, exactly as before\./);
  // 3. Agreed work goes on; a real go or no-go is a Decision with go and hold.
  assert.match(shared, /Work that is already agreed goes on without asking\. Never stop to ask a person whether to continue\./);
  assert.match(shared, /go or no-go is a Decision with the reply words `go` and `hold`/);
  // 4. A status note or a wait names no person, and finishes with a wait the server takes.
  assert.match(shared, /A status note, or a wait on a review, a blocker or a child, names no person: finish as `in_review` naming your review request, or `blocked` naming the blocking issue in `blockedBy` \(a lead names nothing while a child is not done\)/);
  // 5. A check that stays in progress: one more ask, then a person, with no endless wait and no empty commit.
  assert.match(shared, /still shows "in progress" after 20 minutes: ask for it again once\. If it still does 20 minutes later, finish as `blocked` naming the person in `askedUser`, as Your hands/);
  assert.match(shared, /Never wait without limit, and never push an empty commit/);
});

test('only the lead is told to keep at most two epics in flight (CLB-1227)', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  for (const role of ROLE_CATALOGUE.roles) {
    const own = role.platformPrompt.slice(0, -sharedPart(role.platformPrompt).length);
    if (role.id !== 'lead') { assert.doesNotMatch(role.platformPrompt, /two epics/, role.id); continue; }
    assert.match(own, /At most two epics are in flight in a project at the same time\. A third starts when one of the two is live and has been used\./);
    assert.match(own, /work the two that come first in the order you were given them; on any other, assign nothing, say so in the note and finish as `blocked` naming nothing/);
  }
});

test('a part that names --ask-file also says what a seat with an older CLI does (CLB-1227)', () => {
  const { ROLE_CATALOGUE } = load('src/lib/agent-role-catalogue.ts');
  const check = (id, prompt) => {
    for (const part of prompt.split('\n\n')) {
      if (part.includes('--ask-file')) assert.match(part, /`collab --version`: if it is below 0\.17\.0, or `collab run finish` refuses `--ask-file` as an unknown flag, finish without `--ask-file`/, id);
    }
  };
  for (const role of ROLE_CATALOGUE.roles) check(role.id, role.platformPrompt);
  assert.ok(ROLE_CATALOGUE.roles.every(role => role.platformPrompt.includes('--ask-file')));
  // The check itself catches a part that names the option alone.
  assert.throws(() => check('made up', 'Do the work.\n\nFinish with `--ask-file FILE`.'));
});
