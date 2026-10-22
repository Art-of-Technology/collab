import { NextRequest } from 'next/server';
import { issueTrashBrowserMutation } from '@/lib/issue-trash-browser';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  return issueTrashBrowserMutation(request, (await params).issueId, 'PURGED');
}
