import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ContextFolderError } from '@/lib/context-folders';

export function contextFolderErrorResponse(error: unknown) {
  if (error instanceof ContextFolderError) {
    return NextResponse.json({ error: error.message, ...(error.counts && { counts: error.counts }) }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034', 'P2003'].includes(error.code)) {
    return NextResponse.json({ error: 'The folder changed; reload and retry' }, { status: 409 });
  }
  // Prisma errors can carry queries and credentials; log only the category and a validated code.
  const databaseError = error instanceof Prisma.PrismaClientKnownRequestError;
  console.error('context_folder_unexpected_failure', {
    category: databaseError ? 'prisma' : error instanceof Error ? 'error' : 'unknown',
    ...(databaseError && typeof error.code === 'string' && /^P[0-9]{4}$/.test(error.code) ? { code: error.code } : {}),
  });
  return NextResponse.json({ error: 'Unable to change this folder' }, { status: 500 });
}
