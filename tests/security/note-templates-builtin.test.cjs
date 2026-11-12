const { assert, test, load } = require('./helpers.cjs');

const { getBuiltInTemplates, getBuiltInTemplateByName } = load('src/lib/note-templates.ts');
const headings = template => [...template.contentTemplate.matchAll(/<h2>(.*?)<\/h2>/g)].map(match => match[1]);

for (const [name, expected] of [
  ['Use Case Specification', ['Scope and level', 'Primary actor', 'Stakeholders and interests', 'Preconditions', 'Trigger',
    'Main success scenario', 'Extensions', 'Postconditions', 'Open questions']],
  ['Product Requirements', ['Problem', 'Goals', 'Non-goals', 'Users', 'Requirements', 'Success measures', 'Risks', 'Open questions']],
  ['Test Plan', ['Scope', 'Not tested', 'Approach', 'Environments and data', 'Entry criteria', 'Exit criteria', 'Risks']],
  ['Incident Review', ['Summary', 'Impact', 'Timeline', 'Root cause', 'What went well', 'What went badly', 'Follow-up actions']],
]) {
  test(`the ${name} document template has its standard sections, in order`, () => {
    const template = getBuiltInTemplateByName(name);
    assert.ok(template, `${name} is not a built-in template`);
    assert.deepEqual(headings(template), expected);
    assert.ok(template.description && template.icon && template.titleTemplate.includes('{{title}}'));
  });
}

test('an incident review asks for follow-up actions with an owner and a due date, and says it is blameless', () => {
  const { contentTemplate } = getBuiltInTemplateByName('Incident Review');
  assert.match(contentTemplate, /blameless/i);
  assert.match(contentTemplate, /<th>Action<\/th><th>Owner<\/th><th>Due<\/th>/);
});

test('the earlier built-in templates keep their names, and every template has its own name and position', () => {
  const templates = getBuiltInTemplates();
  for (const name of ['System Prompt', 'Architecture Decision Record', 'Meeting Notes', 'README', 'Troubleshooting Guide',
    'How-To Guide', 'Runbook', 'Sprint Retrospective']) assert.ok(getBuiltInTemplateByName(name), name);
  assert.equal(templates.length, 12);
  assert.equal(new Set(templates.map(template => template.name)).size, 12);
  assert.equal(new Set(templates.map(template => template.order)).size, 12);
});
