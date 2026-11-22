import type { Prisma } from '@prisma/client';

function workOnly(where: Prisma.IssueWhereInput = {}): Prisma.IssueWhereInput {
  return { AND: [where, { agentRequestRole: null }] };
}

/** Filter the list and the issue hierarchy displayed with each row. */
export function withoutRequests(where: Prisma.IssueWhereInput, include: Prisma.IssueInclude) {
  const filtered = { ...include };

  for (const relation of ['parent', 'children'] as const) {
    const selection = include[relation];
    if (selection) {
      const args = selection === true ? {} : selection;
      filtered[relation] = { ...args, where: workOnly(args.where) };
    }
  }

  const count = include._count;
  if (count && count !== true && count.select?.children) {
    const children = count.select.children;
    filtered._count = {
      ...count,
      select: {
        ...count.select,
        children: { where: workOnly(children === true ? undefined : children.where) },
      },
    };
  }

  return { where: workOnly(where), include: filtered };
}
