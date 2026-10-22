type Args = Record<string, any>;
type Field = { name: string; type: string; kind: string; isList: boolean; isRequired: boolean; relationFromFields?: readonly string[]; relationToFields?: readonly string[] };
type Model = { name: string; fields: readonly Field[] };

const filteredOperations = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn',
  'upsert', 'delete', 'deleteMany',
]);

function and(where: Args | undefined, guard: Args): Args {
  // Unique selectors must stay outside AND for findUnique/update/upsert.
  return { ...where, AND: [...(where?.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []), guard] };
}

/** Visibility only: authorization remains with each caller. Trash uses a separate client. */
export function issueVisibilityExtension(models: readonly Model[]) {
  const relations = new Map(models.map(model => [model.name,
    new Map(model.fields.filter(field => field.kind === 'object').map(field => [field.name, field]))]));

  function active(model: string, seen = new Set<string>()): Args | undefined {
    if (model === 'Issue') return { deletedAt: null };
    if (seen.has(model)) return undefined;
    const next = new Set([...seen, model]);
    const guards: Args[] = [];
    for (const field of relations.get(model)?.values() || []) {
      if (field.isList || !field.isRequired) continue;
      const guard = active(field.type, next);
      if (guard) guards.push({ [field.name]: guard });
    }
    return guards.length ? { AND: guards } : undefined;
  }

  const guards = new Map(models.map(model => [model.name, active(model.name)]));

  function where(model: string, input: Args | undefined): Args | undefined {
    if (!input) return input;
    const result = { ...input };
    for (const key of ['AND', 'OR', 'NOT']) {
      if (result[key]) result[key] = Array.isArray(result[key])
        ? result[key].map((value: Args) => where(model, value)) : where(model, result[key]);
    }
    for (const [name, field] of relations.get(model) || []) {
      const value = input[name];
      if (!value || typeof value !== 'object') continue;
      const guard = guards.get(field.type);
      if (field.isList) {
        result[name] = { ...value };
        for (const op of ['some', 'none', 'every']) {
          if (!value[op]) continue;
          const predicate = where(field.type, value[op]);
          // Deleted rows do not participate in either existential or universal filters.
          result[name][op] = guard
            ? op === 'every' ? { OR: [{ NOT: guard }, predicate] } : and(predicate, guard)
            : predicate;
        }
      } else if ('is' in value || 'isNot' in value) {
        result[name] = { ...value };
        for (const op of ['is', 'isNot']) {
          if (!value[op]) continue;
          const predicate = where(field.type, value[op]);
          result[name][op] = guard ? and(predicate, guard) : predicate;
        }
      } else {
        const predicate = where(field.type, value);
        result[name] = guard ? and(predicate, guard) : predicate;
      }
    }
    return result;
  }

  function selection(model: string, input: Args): Args {
    const result = { ...input };
    if (input.where) result.where = where(model, input.where);
    for (const mode of ['select', 'include']) {
      if (!input[mode]) continue;
      const selected = { ...input[mode] };
      for (const [name, field] of relations.get(model) || []) {
        if (!selected[name]) continue;
        const nested = selection(field.type, selected[name] === true ? {} : selected[name]);
        const guard = guards.get(field.type);
        // Required to-one relations have no nested where; their containing row is guarded.
        if (guard && (field.isList || !field.isRequired)) nested.where = and(nested.where, guard);
        selected[name] = Object.keys(nested).length ? nested : true;
      }
      if (selected._count) {
        const count = selected._count === true
          ? { select: Object.fromEntries([...(relations.get(model)?.values() || [])].filter(f => f.isList).map(f => [f.name, true])) }
          : { ...selected._count, select: { ...selected._count.select } };
        for (const [name, value] of Object.entries(count.select || {})) {
          const field = relations.get(model)?.get(name);
          if (!value || !field) continue;
          const guard = guards.get(field.type);
          const args = value === true ? {} : value as Args;
          count.select[name] = guard ? { ...args, where: and(where(field.type, args.where), guard) } : value;
        }
        selected._count = count;
      }
      result[mode] = selected;
    }
    return result;
  }

  function writeData(model: string, data: Args | undefined, creating = false, bulk = false): Args | undefined {
    if (!data) return data;
    if (model === 'Issue' && ('deletedAt' in data || 'deletedById' in data)) {
      throw new Error('Issue trash metadata can only be changed through the trash lifecycle');
    }
    const result = { ...data };
    const fields = [...(relations.get(model)?.values() || [])];
    const linksGuardedRow = fields.some(field => guards.get(field.type) &&
      (field.relationFromFields || []).some(key => data[key] !== undefined && data[key] !== null));
    if (bulk && (linksGuardedRow || (creating && guards.get(model)))) {
      throw new Error('Create or link issue-related records individually through a guarded operation');
    }
    // Checked relation connects validate the active parent in the same Prisma operation.
    // Switching from unchecked input requires converting every supplied foreign key.
    if (linksGuardedRow) {
      for (const field of fields) {
        const from = field.relationFromFields || [];
        if (!from.length || !from.some(key => data[key] !== undefined)) continue;
        const values = from.map(key => typeof data[key] === 'object' && data[key] !== null ? data[key].set : data[key]);
        if (values.some(value => value === undefined)) throw new Error('Incomplete relation key');
        if (result[field.name]) throw new Error('Use either a relation or its foreign key');
        for (const key of from) delete result[key];
        if (values.some(value => value === null)) {
          if (!creating) result[field.name] = { disconnect: true };
        } else {
          const to = field.relationToFields || [];
          // Current issue-related foreign keys all reference a single unique id.
          if (to.length !== 1) throw new Error('Use an explicit relation connect for compound keys');
          result[field.name] = { connect: { [to[0]]: values[0] } };
        }
      }
    }
    for (const field of fields) {
      const value = result[field.name];
      if (!value || typeof value !== 'object') continue;
      const guard = guards.get(field.type);
      const nested = { ...value };
      if (guard && (nested.delete || nested.deleteMany || nested.set || nested.disconnect)) {
        throw new Error('Change issue-related records through a guarded model operation');
      }
      // Nested updates bypass model query extensions; existing callers use root operations.
      if (guard && (nested.update || nested.updateMany || nested.upsert || nested.connectOrCreate)) {
        throw new Error('Update issue-related records through a guarded model operation');
      }
      if (guard && nested.connect) {
        nested.connect = Array.isArray(nested.connect)
          ? nested.connect.map((selector: Args) => and(selector, guard)) : and(nested.connect, guard);
      }
      const map = (input: any, fn: (value: Args) => any) => Array.isArray(input) ? input.map(fn) : fn(input);
      if (nested.create) nested.create = map(nested.create, value => writeData(field.type, value, true));
      if (nested.createMany) nested.createMany = { ...nested.createMany,
        data: map(nested.createMany.data, value => writeData(field.type, value, true, true)) };
      // Even unguarded relations may contain deeper Issue writes.
      if (nested.update) nested.update = map(nested.update, value => value.data
        ? { ...value, data: writeData(field.type, value.data) } : writeData(field.type, value));
      if (nested.updateMany) nested.updateMany = map(nested.updateMany, value => ({ ...value, data: writeData(field.type, value.data, false, true) }));
      if (nested.upsert) nested.upsert = map(nested.upsert, value => ({ ...value,
        create: writeData(field.type, value.create, true), update: writeData(field.type, value.update) }));
      if (nested.connectOrCreate) nested.connectOrCreate = map(nested.connectOrCreate, value => ({ ...value,
        create: writeData(field.type, value.create, true) }));
      result[field.name] = nested;
    }
    return result;
  }

  return {
    name: 'active-issue-visibility',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model: string; operation: string; args: Args; query: (args: Args) => Promise<any>;
        }) {
          if (model === 'Issue' && (operation === 'delete' || operation === 'deleteMany')) {
            throw new Error('Permanent issue deletion is only available through the trash lifecycle');
          }
          const guarded = selection(model, args);
          const guard = guards.get(model);
          if (guard && filteredOperations.has(operation)) guarded.where = and(guarded.where, guard);
          if (guarded.data) guarded.data = Array.isArray(guarded.data)
            ? guarded.data.map((data: Args) => writeData(model, data, operation.startsWith('create'), operation.includes('Many')))
            : writeData(model, guarded.data, operation.startsWith('create'), operation.includes('Many'));
          if (guarded.create) guarded.create = writeData(model, guarded.create, true);
          if (guarded.update) guarded.update = writeData(model, guarded.update);
          return query(guarded);
        },
      },
    },
  };
}
