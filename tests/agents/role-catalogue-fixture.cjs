const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { load } = require('../security/helpers.cjs');

const extraRole = {
  id: 'mapper',
  name: 'Mapper',
  platformPrompt: 'Draw a map of the project.',
  takesOrdinaryIssues: false,
  requests: [{ id: 'map', label: 'Map request' }],
  repository: 'none',
  maxPerProject: 1,
};

const file = 'src/lib/agent-role-catalogue.ts';
function extendedCatalogue() {
  if (!existsSync(resolve(file))) return {};
  const { ROLE_CATALOGUE, createRoleCatalogue } = load(file);
  return { ROLE_CATALOGUE: createRoleCatalogue([...ROLE_CATALOGUE.roles, extraRole]) };
}

module.exports = { extraRole, extendedCatalogue };
