import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { IssueTrashError } from '@/lib/issue-trash';
import { ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';

const appCodes: Record<number, string> = {
  400: 'validation_error', 403: 'forbidden', 404: 'not_found', 409: 'issue_conflict',
};

export function issueTrashErrorResponse(error: unknown, client: 'browser' | 'app' = 'browser') {
  if (error instanceof IssueTrashError) return NextResponse.json({
    error: client === 'app' ? appCodes[error.status] || 'request_failed' : error.message,
    error_description: error.message,
  }, { status: error.status });
  if (error instanceof ForgeProjectWriteError) return NextResponse.json(client === 'app'
    ? { error: 'forge_connected_project', error_description: error.message }
    : { error: error.message }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034', 'P2003'].includes(error.code)) {
    const message = 'Issue changed or still has protected references; reload and retry';
    return NextResponse.json(client === 'app'
      ? { error: 'issue_conflict', error_description: message }
      : { error: message }, { status: 409 });
  }
  const databaseError = error instanceof Prisma.PrismaClientKnownRequestError;
  // Prisma errors can contain queries and credentials; only log fixed categories and validated codes.
  console.error('issue_trash_unexpected_failure', {
    category: databaseError ? 'prisma' : error instanceof Error ? 'error' : 'unknown',
    ...(databaseError && typeof error.code === 'string' && error.code.length === 5 && /^P[0-9]{4}$/.test(error.code)
      ? { code: error.code } : {}),
  });
  return NextResponse.json(client === 'app'
    ? { error: 'server_error', error_description: 'Internal server error' }
    : { error: 'Unable to update Trash' }, { status: 500 });
}
