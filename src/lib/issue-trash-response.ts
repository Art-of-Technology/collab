import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { IssueTrashError } from '@/lib/issue-trash';
import { ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';

export function issueTrashErrorResponse(error: unknown) {
  if (error instanceof IssueTrashError) return NextResponse.json({ error: error.message, error_description: error.message }, { status: error.status });
  if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034', 'P2003'].includes(error.code)) {
    return NextResponse.json({ error: 'Issue changed or still has protected references; reload and retry' }, { status: 409 });
  }
  return NextResponse.json({ error: 'Unable to update Trash' }, { status: 500 });
}
