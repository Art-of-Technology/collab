import { notFound } from 'next/navigation';
import { systemAdminId } from '@/lib/system-admin';
import { readPlatformPrompts } from '@/lib/agent-platform-prompts';
import { PlatformPromptsEditor } from './PlatformPromptsEditor';

export const dynamic = 'force-dynamic';

// Admin, Roles (CLB-916): a system admin edits each role's platform prompt, the first layer of every seat's run.
export default async function AdminAgentRolesPage() {
  if (!await systemAdminId()) notFound();
  const { roles } = await readPlatformPrompts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Roles</h1>
        <p className="text-gray-400">
          Each role&apos;s platform prompt: the first thing every seat of the role is told when its run starts, in every workspace.
          The repository ships the starting text. A saved edit replaces it from the next run on, and can be undone.
        </p>
      </div>
      {/* Dates as text: what the client component receives is plain JSON. */}
      <PlatformPromptsEditor roles={JSON.parse(JSON.stringify(roles))} />
    </div>
  );
}
