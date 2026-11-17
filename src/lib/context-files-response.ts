import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ContextFolderError } from '@/lib/context-folders';

/**
 * What went wrong with a file, in the caller's words. A file's rules are its folder's rules, so both
 * raise the same error class; only the fallback wording differs.
 */
export function contextFileErrorResponse(error: unknown) {
  if (error instanceof ContextFolderError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034', 'P2003'].includes(error.code)) {
    return NextResponse.json({ error: 'The file changed; reload and retry' }, { status: 409 });
  }
  // Prisma errors can carry queries and credentials; log only the category and a validated code.
  const databaseError = error instanceof Prisma.PrismaClientKnownRequestError;
  console.error('context_file_unexpected_failure', {
    category: databaseError ? 'prisma' : error instanceof Error ? 'error' : 'unknown',
    ...(databaseError && typeof error.code === 'string' && /^P[0-9]{4}$/.test(error.code) ? { code: error.code } : {}),
  });
  return NextResponse.json({ error: 'Unable to change this file' }, { status: 500 });
}
